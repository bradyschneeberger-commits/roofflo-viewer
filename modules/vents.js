/*
RoofFlo V2
File: vents.js

Purpose:
Handle vent placement and vent geometry.

Vent Types:
- Intake Vent
- Static Exhaust Vent
- Ridge Vent

Rules:
- Intake vents attach to bottom of intake plenum
- Intake vents run parallel to eaves only
- Static vents must be within 36 inches of ridge
- Ridge vents are placed with click start → click end
- Ridge vents snap to ridge centerline
- Ridge vent width = 2 inches

Reset Behavior:
Reset removes all vents and clears placement state.

Exports:
placeIntakeVent()
placeStaticVent()
placeRidgeVent()
clearAllVents()
*/

import * as THREE from "three";
import { scene } from "./scene.js";
import { getGeometryState } from "./geometry.js";

const INTAKE_COLOR = 0x7dfbff;
const STATIC_COLOR = 0xff6a3d;
const RIDGE_COLOR = 0xffe347;

const INTAKE_NFVA_IN2 = 50;
const STATIC_NFVA_IN2 = 50;
const RIDGE_NFVA_PER_FOOT_IN2 = 18;

const INTAKE_WIDTH_FEET = 0.45;
const INTAKE_HEIGHT_FEET = 0.06;
const INTAKE_LENGTH_FEET = 1.5;

const STATIC_SIZE_FEET = 0.75; // 9 inches
const RIDGE_WIDTH_FEET = 2 / 12; // 2 inches

const raycaster = new THREE.Raycaster();
raycaster.params.Line = { threshold: 0.45 };

const intakeVents = [];
const staticVents = [];
const ridgeVents = [];

let pendingRidgeStart = null;
let pendingRidgeMarker = null;

function setRayFromPointer(camera, pointerNdc) {
	raycaster.setFromCamera(pointerNdc, camera);
}

function getLineEndpoints(line) {
	const positionAttr = line.geometry.getAttribute("position");
	const start = new THREE.Vector3(positionAttr.getX(0), positionAttr.getY(0), positionAttr.getZ(0));
	const end = new THREE.Vector3(positionAttr.getX(1), positionAttr.getY(1), positionAttr.getZ(1));
	return { start, end };
}

function clearPendingRidgeMarker() {
	if (pendingRidgeMarker) {
		scene.remove(pendingRidgeMarker);
		pendingRidgeMarker.geometry.dispose();
		pendingRidgeMarker.material.dispose();
		pendingRidgeMarker = null;
	}
}

function cancelPendingRidgePlacement() {
	pendingRidgeStart = null;
	clearPendingRidgeMarker();
}

function tryPlaceIntakeVent(camera, pointerNdc) {
	const { leftIntakePlacement, rightIntakePlacement } = getGeometryState();
	if (!leftIntakePlacement || !rightIntakePlacement) {
		return false;
	}

	setRayFromPointer(camera, pointerNdc);
	const hits = raycaster.intersectObjects([leftIntakePlacement, rightIntakePlacement], false);
	if (!hits.length) {
		return false;
	}

	const hit = hits[0];
	const placementLine = hit.object;
	const side = placementLine.name === "leftIntakePlacement" ? "left" : "right";
	const { start, end } = getLineEndpoints(placementLine);
	const clampedZ = THREE.MathUtils.clamp(hit.point.z, Math.min(start.z, end.z), Math.max(start.z, end.z));

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(INTAKE_WIDTH_FEET, INTAKE_HEIGHT_FEET, INTAKE_LENGTH_FEET),
		new THREE.MeshStandardMaterial({ color: INTAKE_COLOR, emissive: 0x09353a, emissiveIntensity: 0.35 })
	);
	ventMesh.position.set(start.x, start.y + 0.03, clampedZ);
	ventMesh.name = "intakeVent";
	scene.add(ventMesh);

	intakeVents.push({
		type: "intake",
		side,
		position: ventMesh.position.clone(),
		orientation: new THREE.Vector3(0, 0, 1),
		width: INTAKE_WIDTH_FEET,
		length: INTAKE_LENGTH_FEET,
		mesh: ventMesh
	});

	return true;
}

function tryPlaceStaticVent(camera, pointerNdc) {
	const { leftExhaustZone, rightExhaustZone } = getGeometryState();
	if (!leftExhaustZone || !rightExhaustZone) {
		return false;
	}

	setRayFromPointer(camera, pointerNdc);
	const hits = raycaster.intersectObjects([leftExhaustZone, rightExhaustZone], false);
	if (!hits.length) {
		return false;
	}

	const hit = hits[0];
	const zone = hit.object;
	const side = zone.name === "leftExhaustZone" ? "left" : "right";

	const worldNormal = hit.face
		? hit.face.normal.clone().transformDirection(zone.matrixWorld).normalize()
		: new THREE.Vector3(0, 1, 0);

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(STATIC_SIZE_FEET, 0.05, STATIC_SIZE_FEET),
		new THREE.MeshStandardMaterial({ color: STATIC_COLOR, emissive: 0x3c1204, emissiveIntensity: 0.25 })
	);

	const orientation = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		worldNormal
	);
	ventMesh.quaternion.copy(orientation);
	ventMesh.position.copy(hit.point).addScaledVector(worldNormal, 0.03);
	ventMesh.name = "staticVent";
	scene.add(ventMesh);

	staticVents.push({
		type: "static",
		side,
		position: ventMesh.position.clone(),
		orientation: ventMesh.quaternion.clone(),
		openingSizeFeet: STATIC_SIZE_FEET,
		mesh: ventMesh
	});

	return true;
}

function getSnappedPointOnRidge(hitPoint, ridgeLine) {
	const { start, end } = getLineEndpoints(ridgeLine);
	const zMin = Math.min(start.z, end.z);
	const zMax = Math.max(start.z, end.z);
	const z = THREE.MathUtils.clamp(hitPoint.z, zMin, zMax);
	return new THREE.Vector3(start.x, start.y, z);
}

function createRidgeStartMarker(point) {
	clearPendingRidgeMarker();
	pendingRidgeMarker = new THREE.Mesh(
		new THREE.SphereGeometry(0.14, 12, 12),
		new THREE.MeshStandardMaterial({ color: RIDGE_COLOR, emissive: 0x554300, emissiveIntensity: 0.35 })
	);
	pendingRidgeMarker.position.copy(point);
	pendingRidgeMarker.name = "ridgeStartMarker";
	scene.add(pendingRidgeMarker);
}

function tryPlaceRidgeVent(camera, pointerNdc) {
	const { ridgeCenterLine } = getGeometryState();
	if (!ridgeCenterLine) {
		return false;
	}

	setRayFromPointer(camera, pointerNdc);
	const hits = raycaster.intersectObject(ridgeCenterLine, false);
	if (!hits.length) {
		return false;
	}

	const snappedPoint = getSnappedPointOnRidge(hits[0].point, ridgeCenterLine);
	if (!pendingRidgeStart) {
		pendingRidgeStart = snappedPoint.clone();
		createRidgeStartMarker(pendingRidgeStart);
		return true;
	}

	const length = pendingRidgeStart.distanceTo(snappedPoint);
	if (length < 0.08) {
		return false;
	}

	const midpoint = pendingRidgeStart.clone().add(snappedPoint).multiplyScalar(0.5);
	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(RIDGE_WIDTH_FEET, 0.05, length),
		new THREE.MeshStandardMaterial({ color: RIDGE_COLOR, emissive: 0x4a4300, emissiveIntensity: 0.25 })
	);

	ventMesh.position.copy(midpoint);
	ventMesh.position.y += 0.025;
	ventMesh.name = "ridgeVent";
	scene.add(ventMesh);

	ridgeVents.push({
		type: "ridge",
		position: ventMesh.position.clone(),
		orientation: new THREE.Vector3(0, 0, 1),
		start: pendingRidgeStart.clone(),
		end: snappedPoint.clone(),
		length,
		width: RIDGE_WIDTH_FEET,
		mesh: ventMesh
	});

	pendingRidgeStart = null;
	clearPendingRidgeMarker();
	return true;
}

function clearVentArray(vents) {
	for (const vent of vents) {
		if (vent.mesh) {
			scene.remove(vent.mesh);
			if (vent.mesh.geometry) {
				vent.mesh.geometry.dispose();
			}
			if (vent.mesh.material) {
				if (Array.isArray(vent.mesh.material)) {
					for (const material of vent.mesh.material) {
						material.dispose();
					}
				} else {
					vent.mesh.material.dispose();
				}
			}
		}
	}
	vents.length = 0;
}

function clearAllVents() {
	clearVentArray(intakeVents);
	clearVentArray(staticVents);
	clearVentArray(ridgeVents);
	cancelPendingRidgePlacement();
}

function getInstalledVentSummary() {
	const ridgeLinearFeet = ridgeVents.reduce((sum, vent) => sum + vent.length, 0);
	const installedIntakeNFVA = intakeVents.length * INTAKE_NFVA_IN2;
	const installedExhaustNFVA =
		(staticVents.length * STATIC_NFVA_IN2) +
		(ridgeLinearFeet * RIDGE_NFVA_PER_FOOT_IN2);

	return {
		intakeCount: intakeVents.length,
		staticCount: staticVents.length,
		ridgeCount: ridgeVents.length,
		ridgeLinearFeet,
		ridgeLengthFeet: ridgeLinearFeet,
		installedIntakeNFVA,
		installedExhaustNFVA
	};
}

function getVentSummary() {
	return getInstalledVentSummary();
}

function getPlacedIntakeVents() {
	return intakeVents;
}

function getPlacedStaticVents() {
	return staticVents;
}

function getPlacedRidgeVents() {
	return ridgeVents;
}

function hasPendingRidgePlacement() {
	return Boolean(pendingRidgeStart);
}

export {
	intakeVents,
	staticVents,
	ridgeVents,
	tryPlaceIntakeVent,
	tryPlaceStaticVent,
	tryPlaceRidgeVent,
	cancelPendingRidgePlacement,
	hasPendingRidgePlacement,
	clearAllVents,
	getInstalledVentSummary,
	getVentSummary,
	getPlacedIntakeVents,
	getPlacedStaticVents,
	getPlacedRidgeVents
};
