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
import {
	calculateAtticArea,
	calculateRequiredVentilation,
	calculateRequiredIntake,
	calculateRequiredExhaust
} from "./calculations.js";

const INTAKE_COLOR = 0x7dfbff;
const STATIC_COLOR = 0xff2d2d;
const RIDGE_OPENING_COLOR = 0xff00aa;
const RIDGE_BODY_COLOR = 0xffd400;

const INTAKE_NFVA_IN2 = 50;
const STATIC_NFVA_IN2 = 50;
const RIDGE_NFVA_PER_FOOT_IN2 = 18;

const INTAKE_WIDTH_FEET = 0.45;
const INTAKE_HEIGHT_FEET = 0.06;
const INTAKE_LENGTH_FEET = 1.5;

const STATIC_SIZE_FEET = 0.75; // 9 inches
const STATIC_HEIGHT_FEET = 0.1;
const STATIC_SURFACE_OFFSET_FEET = 0.05;
const RIDGE_WIDTH_FEET = 2 / 12; // 2 inches

const raycaster = new THREE.Raycaster();
raycaster.params.Line = { threshold: 0.45 };

const intakeVents = [];
const staticVents = [];
const ridgeVents = [];

let pendingRidgeStart = null;
let pendingRidgeMarker = null;

// --------------------------------------------------
// Ghost Preview System
// --------------------------------------------------

let ghostPreviewGroup = null;
let ghostIntakeMesh = null;
let ghostStaticMesh = null;
let ghostRidgeMesh = null;
let currentPreviewMode = null;

// Variables to store current preview snapped positions for click placement
let intakePreviewSnappedPoint = null;
let intakePreviewPlacementLine = null;
let staticPreviewSnappedPoint = null;
let staticPreviewNormal = null;
let staticPreviewPlacementLine = null;
let staticPreviewZoneMesh = null;
let ridgePreviewSnappedPoint = null;

// Validity tracking for preview feedback
let currentPreviewIsValid = false;

const GHOST_INTAKE_COLOR = 0x7dfbff;
const GHOST_STATIC_COLOR = 0xff2d2d;
const GHOST_RIDGE_COLOR = 0xff00aa;

// Colors for valid/invalid preview feedback
const VALID_PREVIEW_COLOR = 0x00ff00;
const INVALID_PREVIEW_COLOR = 0xff0000;

function resetPreviewState() {
	intakePreviewSnappedPoint = null;
	intakePreviewPlacementLine = null;
	staticPreviewSnappedPoint = null;
	staticPreviewNormal = null;
	staticPreviewPlacementLine = null;
	staticPreviewZoneMesh = null;
	ridgePreviewSnappedPoint = null;
	currentPreviewIsValid = false;
}

function initializeVentPreview() {
	if (ghostPreviewGroup) {
		scene.remove(ghostPreviewGroup);
		ghostPreviewGroup = null;
	}

	ghostPreviewGroup = new THREE.Group();
	ghostPreviewGroup.name = "ghostPreviewGroup";
	ghostPreviewGroup.renderOrder = 100;
	scene.add(ghostPreviewGroup);

	ghostIntakeMesh = new THREE.Mesh(
		new THREE.BoxGeometry(INTAKE_WIDTH_FEET, INTAKE_HEIGHT_FEET, INTAKE_LENGTH_FEET),
		new THREE.MeshStandardMaterial({
			color: GHOST_INTAKE_COLOR,
			transparent: true,
			opacity: 0.5,
			emissive: 0x2d4e52,
			emissiveIntensity: 0.2
		})
	);
	ghostIntakeMesh.castShadow = false;
	ghostIntakeMesh.receiveShadow = false;
	ghostIntakeMesh.visible = false;
	ghostPreviewGroup.add(ghostIntakeMesh);

	ghostStaticMesh = new THREE.Mesh(
		new THREE.BoxGeometry(STATIC_SIZE_FEET, 0.05, STATIC_SIZE_FEET),
		new THREE.MeshStandardMaterial({
			color: GHOST_STATIC_COLOR,
			transparent: true,
			opacity: 0.45,
			emissive: 0x330000,
			emissiveIntensity: 0.12,
			roughness: 0.55,
			metalness: 0.08
		})
	);
	ghostStaticMesh.castShadow = false;
	ghostStaticMesh.receiveShadow = false;
	ghostStaticMesh.visible = false;
	ghostPreviewGroup.add(ghostStaticMesh);

	ghostRidgeMesh = new THREE.Mesh(
		new THREE.SphereGeometry(0.12, 10, 10),
		new THREE.MeshStandardMaterial({
			color: GHOST_RIDGE_COLOR,
			transparent: true,
			opacity: 0.55,
			emissive: 0x330022,
			emissiveIntensity: 0.22
		})
	);
	ghostRidgeMesh.castShadow = false;
	ghostRidgeMesh.receiveShadow = false;
	ghostRidgeMesh.visible = false;
	ghostPreviewGroup.add(ghostRidgeMesh);

	currentPreviewMode = null;
	resetPreviewState();
}

function hideVentPreview() {
	if (ghostPreviewGroup) {
		ghostPreviewGroup.visible = false;
	}
	if (ghostIntakeMesh) ghostIntakeMesh.visible = false;
	if (ghostStaticMesh) ghostStaticMesh.visible = false;
	if (ghostRidgeMesh) ghostRidgeMesh.visible = false;

	currentPreviewMode = null;
	resetPreviewState();
}

function clearVentPreview() {
	if (ghostPreviewGroup) {
		scene.remove(ghostPreviewGroup);
		if (ghostIntakeMesh?.geometry) ghostIntakeMesh.geometry.dispose();
		if (ghostIntakeMesh?.material) ghostIntakeMesh.material.dispose();
		if (ghostStaticMesh?.geometry) ghostStaticMesh.geometry.dispose();
		if (ghostStaticMesh?.material) ghostStaticMesh.material.dispose();
		if (ghostRidgeMesh?.geometry) ghostRidgeMesh.geometry.dispose();
		if (ghostRidgeMesh?.material) ghostRidgeMesh.material.dispose();
		ghostPreviewGroup = null;
		ghostIntakeMesh = null;
		ghostStaticMesh = null;
		ghostRidgeMesh = null;
	}
	currentPreviewMode = null;
	resetPreviewState();
}

function findNearestPointOnLine(point, lineStart, lineEnd) {
	const lineVec = lineEnd.clone().sub(lineStart);
	const pointVec = point.clone().sub(lineStart);
	const lineLenSq = lineVec.lengthSq();

	if (lineLenSq === 0) {
		return lineStart.clone();
	}

	const t = Math.max(0, Math.min(1, pointVec.dot(lineVec) / lineLenSq));
	return lineStart.clone().addScaledVector(lineVec, t);
}

// --------------------------------------------------
// Validation Functions for Preview Feedback
// --------------------------------------------------

function isValidIntakePlacement() {
	if (!intakePreviewSnappedPoint || !intakePreviewPlacementLine) {
		return false;
	}

	const position = new THREE.Vector3(
		intakePreviewSnappedPoint.x,
		intakePreviewSnappedPoint.y,
		intakePreviewSnappedPoint.z
	);

	return !isDuplicateIntakeVent(position);
}

function isValidStaticPlacement() {
	if (!staticPreviewSnappedPoint || !staticPreviewNormal || !staticPreviewPlacementLine) {
		return false;
	}

	const position = staticPreviewSnappedPoint.clone
		? staticPreviewSnappedPoint.clone()
		: new THREE.Vector3(
			staticPreviewSnappedPoint.x,
			staticPreviewSnappedPoint.y,
			staticPreviewSnappedPoint.z
		);

	return !isDuplicateStaticVent(position);
}

function isValidRidgePlacement() {
	if (!ridgePreviewSnappedPoint) {
		return false;
	}

	if (!pendingRidgeStart) {
		return true;
	}

	const length = pendingRidgeStart.distanceTo(ridgePreviewSnappedPoint);

	if (length < 0.08) {
		return false;
	}

	return !isDuplicateRidgeSegment(pendingRidgeStart, ridgePreviewSnappedPoint);
}

function updatePreviewMaterialValidity(mesh, isValid) {
	if (!mesh || !mesh.material) return;

	if (isValid) {
		mesh.material.color.setHex(VALID_PREVIEW_COLOR);
		mesh.material.opacity = 0.6;
		mesh.material.emissive.setHex(0x003300);
		mesh.material.emissiveIntensity = 0.15;
	} else {
		mesh.material.color.setHex(INVALID_PREVIEW_COLOR);
		mesh.material.opacity = 0.5;
		mesh.material.emissive.setHex(0x330000);
		mesh.material.emissiveIntensity = 0.25;
	}
}

function updateIntakePreview(hitPoint, placementLine) {
	if (!ghostPreviewGroup || !ghostIntakeMesh) return;

	const { start, end } = getLineEndpoints(placementLine);

	const nearestPoint = findNearestPointOnLine(hitPoint, start, end);

	const clampedZ = THREE.MathUtils.clamp(
		nearestPoint.z,
		Math.min(start.z, end.z),
		Math.max(start.z, end.z)
	);

	ghostIntakeMesh.position.set(start.x, start.y + 0.03, clampedZ);
	ghostIntakeMesh.quaternion.set(0, 0, 0, 1);
	ghostIntakeMesh.visible = true;
	ghostIntakeMesh.castShadow = false;

	if (ghostStaticMesh) ghostStaticMesh.visible = false;
	if (ghostRidgeMesh) ghostRidgeMesh.visible = false;

	ghostPreviewGroup.visible = true;
	currentPreviewMode = "intake";

	intakePreviewSnappedPoint = { x: start.x, y: start.y + 0.03, z: clampedZ };
	intakePreviewPlacementLine = placementLine;

	currentPreviewIsValid = isValidIntakePlacement();
	updatePreviewMaterialValidity(ghostIntakeMesh, currentPreviewIsValid);
}

function updateStaticPreview(hitPoint, placementLine, roofNormal, zoneMesh = null) {
	if (!ghostPreviewGroup || !ghostStaticMesh) return;

	const { start, end } = getLineEndpoints(placementLine);
	const nearestPoint = findNearestPointOnLine(hitPoint, start, end);

	const clampedZ = THREE.MathUtils.clamp(
		nearestPoint.z,
		Math.min(start.z, end.z),
		Math.max(start.z, end.z)
	);

	const normalizedRoofNormal = roofNormal.clone().normalize();

	const orientation = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		normalizedRoofNormal
	);

	const previewSurfacePoint = new THREE.Vector3(nearestPoint.x, nearestPoint.y, clampedZ);
	const placedPosition = previewSurfacePoint.clone().addScaledVector(normalizedRoofNormal, STATIC_SURFACE_OFFSET_FEET);

	ghostStaticMesh.position.copy(placedPosition);
	ghostStaticMesh.quaternion.copy(orientation);
	ghostStaticMesh.visible = true;
	ghostStaticMesh.castShadow = false;

	if (ghostIntakeMesh) ghostIntakeMesh.visible = false;
	if (ghostRidgeMesh) ghostRidgeMesh.visible = false;

	ghostPreviewGroup.visible = true;
	currentPreviewMode = "static";

	staticPreviewSnappedPoint = placedPosition.clone();
	staticPreviewNormal = normalizedRoofNormal.clone();
	staticPreviewPlacementLine = placementLine;
	staticPreviewZoneMesh = zoneMesh;

	currentPreviewIsValid = isValidStaticPlacement();
	updatePreviewMaterialValidity(ghostStaticMesh, currentPreviewIsValid);
}

function updateRidgePreview(snappedPoint) {
	if (!ghostPreviewGroup || !ghostRidgeMesh) return;

	ghostRidgeMesh.position.copy(snappedPoint);
	ghostRidgeMesh.visible = true;
	ghostRidgeMesh.castShadow = false;

	if (ghostIntakeMesh) ghostIntakeMesh.visible = false;
	if (ghostStaticMesh) ghostStaticMesh.visible = false;

	ghostPreviewGroup.visible = true;
	currentPreviewMode = "ridge";

	ridgePreviewSnappedPoint = snappedPoint.clone();

	currentPreviewIsValid = isValidRidgePlacement();
	updatePreviewMaterialValidity(ghostRidgeMesh, currentPreviewIsValid);
}

function updateVentPreview(pointerNdc, camera, placementMode) {
	const {
		leftStaticPlacementLine,
		rightStaticPlacementLine,
		leftExhaustZone,
		rightExhaustZone,
		ridgeCenterLine
	} = getGeometryState();

	if (!placementMode || placementMode === "none" || !ghostPreviewGroup) {
		hideVentPreview();
		return;
	}

	setRayFromPointer(camera, pointerNdc);

	if (placementMode === "intake") {
		const intakePlacementLines = getAvailableIntakePlacementLines();
		if (!intakePlacementLines.length) {
			hideVentPreview();
			return;
		}

		const hits = raycaster.intersectObjects(intakePlacementLines, false);
		if (!hits.length) {
			hideVentPreview();
			return;
		}

		updateIntakePreview(hits[0].point, hits[0].object);
		return;
	}

		if (placementMode === "static") {
		if (!leftExhaustZone || !rightExhaustZone || !leftStaticPlacementLine || !rightStaticPlacementLine) {
			hideVentPreview();
			return;
		}

		const zoneHits = raycaster.intersectObjects([leftExhaustZone, rightExhaustZone], false);
		if (!zoneHits.length) {
			hideVentPreview();
			return;
		}

		const zoneHit = zoneHits[0];
		const zone = zoneHit.object;
		const placementLine = zone.name === "leftExhaustZone" ? leftStaticPlacementLine : rightStaticPlacementLine;

		let faceWorldNormal = null;
		if (zoneHit.face?.normal) {
			faceWorldNormal = zoneHit.face.normal.clone();
			const normalMatrix = new THREE.Matrix3().getNormalMatrix(zone.matrixWorld);
			faceWorldNormal.applyMatrix3(normalMatrix).normalize();
		}

		const outwardNormal = resolveOutwardRoofNormal(zone, zoneHit.point.clone(), faceWorldNormal);
		updateStaticPreview(zoneHit.point, placementLine, outwardNormal, zone);
		return;
	}

	if (placementMode === "ridge") {
		if (!ridgeCenterLine) {
			hideVentPreview();
			return;
		}

		const hits = raycaster.intersectObject(ridgeCenterLine, false);
		if (!hits.length) {
			hideVentPreview();
			return;
		}

		const snappedPoint = getSnappedPointOnRidge(hits[0].point, ridgeCenterLine);
		updateRidgePreview(snappedPoint);
		return;
	}

	hideVentPreview();
}

function setRayFromPointer(camera, pointerNdc) {
	raycaster.setFromCamera(pointerNdc, camera);
}

function getGeometryRoofType() {
	const { currentGeometryParams } = getGeometryState();
	return currentGeometryParams?.roofType || "gable";
}

function getAvailableIntakePlacementLines() {
	const { intakeEdgeLine, leftIntakePlacement, rightIntakePlacement } = getGeometryState();

	if (getGeometryRoofType() === "shed") {
		return intakeEdgeLine ? [intakeEdgeLine] : [];
	}

	return [leftIntakePlacement, rightIntakePlacement].filter(Boolean);
}

function getIntakePlacementLineForStoredSide(side) {
	const { intakeEdgeLine, leftIntakePlacement, rightIntakePlacement } = getGeometryState();

	if (getGeometryRoofType() === "shed") {
		return intakeEdgeLine;
	}

	return side === "right" ? rightIntakePlacement : leftIntakePlacement;
}

function getIntakeSideForLine(line) {
	if (getGeometryRoofType() === "shed") {
		return "low";
	}

	return line?.name === "rightIntakePlacement" ? "right" : "left";
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

function tryPlaceIntakeVent() {
	if (!currentPreviewIsValid || currentPreviewMode !== "intake") {
		return false;
	}

	if (!intakePreviewSnappedPoint || !intakePreviewPlacementLine) {
		return false;
	}

	const position = new THREE.Vector3(
		intakePreviewSnappedPoint.x,
		intakePreviewSnappedPoint.y,
		intakePreviewSnappedPoint.z
	);

	if (isDuplicateIntakeVent(position)) {
		return false;
	}

	const side = getIntakeSideForLine(intakePreviewPlacementLine);

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(INTAKE_WIDTH_FEET, INTAKE_HEIGHT_FEET, INTAKE_LENGTH_FEET),
		new THREE.MeshStandardMaterial({ color: INTAKE_COLOR, emissive: 0x09353a, emissiveIntensity: 0.35 })
	);
	ventMesh.position.copy(position);
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

function tryPlaceStaticVent() {
	if (!currentPreviewIsValid || currentPreviewMode !== "static") {
		return false;
	}

	if (!staticPreviewSnappedPoint || !staticPreviewNormal || !staticPreviewPlacementLine || !staticPreviewZoneMesh) {
		return false;
	}

	// Route manual placement through the shared static transform path.
	return placeStaticVentAt(
		staticPreviewPlacementLine,
		staticPreviewZoneMesh,
		Number(staticPreviewSnappedPoint.z)
	);
}

function getSnappedPointOnRidge(hitPoint, ridgeLine) {
	const { start, end } = getLineEndpoints(ridgeLine);
	const zMin = Math.min(start.z, end.z);
	const zMax = Math.max(start.z, end.z);
	const z = THREE.MathUtils.clamp(hitPoint.z, zMin, zMax);
	return new THREE.Vector3(start.x, start.y, z);
}

function isDuplicateIntakeVent(position) {
	const minCenterSpacing = INTAKE_LENGTH_FEET * 0.9;

	return intakeVents.some((vent) => {
		const sameSide = intakePreviewPlacementLine && vent.side === getIntakeSideForLine(intakePreviewPlacementLine);

		if (!sameSide) {
			return false;
		}

		const zDistance = Math.abs(vent.position.z - position.z);
		return zDistance < minCenterSpacing;
	});
}

function isDuplicateStaticVent(position) {
	const minCenterSpacing = STATIC_SIZE_FEET * 0.9;

	return staticVents.some((vent) => {
		const distance = vent.position.distanceTo(position);
		return distance < minCenterSpacing;
	});
}

function isDuplicateRidgeSegment(startPoint, endPoint, tolerance = 0.2) {
	return ridgeVents.some((vent) => {
		const distStart = vent.start.distanceTo(startPoint);
		const distEnd = vent.end.distanceTo(endPoint);
		return distStart < tolerance && distEnd < tolerance;
	});
}

function createRidgeStartMarker(point) {
	clearPendingRidgeMarker();
	pendingRidgeMarker = new THREE.Mesh(
		new THREE.SphereGeometry(0.14, 12, 12),
		new THREE.MeshStandardMaterial({
			color: GHOST_RIDGE_COLOR,
			transparent: true,
			opacity: 0.6,
			emissive: 0x330022,
			emissiveIntensity: 0.22
		})
	);
	pendingRidgeMarker.position.copy(point);
	pendingRidgeMarker.name = "ridgeStartMarker";
	scene.add(pendingRidgeMarker);
}

function createRidgeVentGeometry(startPoint, endPoint) {
	const group = new THREE.Group();
	group.name = "ridgeVentGroup";

	const ridgeSegment = endPoint.clone().sub(startPoint);
	const length = ridgeSegment.length();
	const midpoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);
	const alongAxis = length > 0.00001
		? ridgeSegment.clone().divideScalar(length)
		: new THREE.Vector3(0, 0, 1);

	let acrossAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), alongAxis).normalize();
	if (!Number.isFinite(acrossAxis.x) || !Number.isFinite(acrossAxis.y) || !Number.isFinite(acrossAxis.z) || acrossAxis.lengthSq() <= 0.00001) {
		acrossAxis = new THREE.Vector3(1, 0, 0);
	}

	const baseAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), alongAxis);
	const capHalfWidth = RIDGE_WIDTH_FEET * 2.0;
	const capRise = 0.085;
	const capShape = new THREE.Shape();
	capShape.moveTo(-capHalfWidth, 0);
	capShape.lineTo(0, capRise);
	capShape.lineTo(capHalfWidth, 0);
	capShape.lineTo(-capHalfWidth, 0);

	const capGeometry = new THREE.ExtrudeGeometry(capShape, {
		depth: length,
		bevelEnabled: false,
		steps: 1
	});
	const capMesh = new THREE.Mesh(
		capGeometry,
		new THREE.MeshStandardMaterial({
			color: RIDGE_BODY_COLOR,
			emissive: 0x261f00,
			emissiveIntensity: 0.08,
			roughness: 0.4,
			metalness: 0.14
		})
	);
	capMesh.quaternion.copy(baseAlign);
	capMesh.position.copy(midpoint)
		.addScaledVector(alongAxis, -length * 0.5);
	capMesh.position.y += 0.028;
	capMesh.name = "ridgeCap";
	group.add(capMesh);

	const footprintWidth = RIDGE_WIDTH_FEET * 3.0;
	const footprintMesh = new THREE.Mesh(
		new THREE.BoxGeometry(footprintWidth, 0.022, length),
		new THREE.MeshStandardMaterial({
			color: RIDGE_BODY_COLOR,
			roughness: 0.6,
			metalness: 0.04,
			transparent: true,
			opacity: 0.74
		})
	);
	footprintMesh.quaternion.copy(baseAlign);
	footprintMesh.position.copy(midpoint);
	footprintMesh.position.y += 0.01;
	footprintMesh.name = "ridgeFootprint";
	group.add(footprintMesh);

	return group;
}

function tryPlaceRidgeVent() {
	if (!currentPreviewIsValid || currentPreviewMode !== "ridge") {
		return false;
	}

	if (!ridgePreviewSnappedPoint) {
		return false;
	}

	if (!pendingRidgeStart) {
		pendingRidgeStart = ridgePreviewSnappedPoint.clone();
		createRidgeStartMarker(pendingRidgeStart);
		return true;
	}

	const endPoint = ridgePreviewSnappedPoint.clone();
	const length = pendingRidgeStart.distanceTo(endPoint);

	if (length < 0.08) {
		return false;
	}

	if (isDuplicateRidgeSegment(pendingRidgeStart, endPoint)) {
		pendingRidgeStart = null;
		clearPendingRidgeMarker();
		return false;
	}

	const ridgeGroup = createRidgeVentGeometry(pendingRidgeStart, endPoint);
	scene.add(ridgeGroup);

	ridgeVents.push({
		type: "ridge",
		position: pendingRidgeStart.clone().add(endPoint).multiplyScalar(0.5),
		orientation: new THREE.Vector3(0, 0, 1),
		start: pendingRidgeStart.clone(),
		end: endPoint.clone(),
		length,
		width: RIDGE_WIDTH_FEET,
		mesh: ridgeGroup
	});

	pendingRidgeStart = null;
	clearPendingRidgeMarker();
	return true;
}

function clearVentArray(vents) {
	for (const vent of vents) {
		if (vent.mesh) {
			scene.remove(vent.mesh);

			if (vent.mesh.isGroup) {
				vent.mesh.traverse((child) => {
					if (child.geometry) {
						child.geometry.dispose();
					}
					if (child.material) {
						if (Array.isArray(child.material)) {
							for (const material of child.material) {
								material.dispose();
							}
						} else {
							child.material.dispose();
						}
					}
				});
			} else {
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
	}
	vents.length = 0;
}

function clearAllVents() {
	clearVentArray(intakeVents);
	clearVentArray(staticVents);
	clearVentArray(ridgeVents);
	cancelPendingRidgePlacement();
	resetPreviewState();
	hideVentPreview();
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

function getCurrentPreviewValidity() {
	return currentPreviewIsValid;
}

function hasStaticVentConflict() {
	const hasLeft = staticVents.some((vent) => vent.side === "left");
	const hasRight = staticVents.some((vent) => vent.side === "right");
	return hasLeft && hasRight;
}

function getLineZBounds(line) {
	if (!line?.geometry) {
		return null;
	}

	const { start, end } = getLineEndpoints(line);
	return {
		start,
		end,
		zMin: Math.min(start.z, end.z),
		zMax: Math.max(start.z, end.z)
	};
}

function getExhaustZoneNormal(zoneMesh) {
	if (!zoneMesh?.geometry) {
		return new THREE.Vector3(0, 1, 0);
	}

	const positionAttr = zoneMesh.geometry.getAttribute("position");
	const indexAttr = zoneMesh.geometry.index;

	if (!positionAttr || !indexAttr || indexAttr.count < 3) {
		return new THREE.Vector3(0, 1, 0);
	}

	const idx0 = indexAttr.getX(0);
	const idx1 = indexAttr.getX(1);
	const idx2 = indexAttr.getX(2);

	const v0 = new THREE.Vector3(
		positionAttr.getX(idx0),
		positionAttr.getY(idx0),
		positionAttr.getZ(idx0)
	);
	const v1 = new THREE.Vector3(
		positionAttr.getX(idx1),
		positionAttr.getY(idx1),
		positionAttr.getZ(idx1)
	);
	const v2 = new THREE.Vector3(
		positionAttr.getX(idx2),
		positionAttr.getY(idx2),
		positionAttr.getZ(idx2)
	);

	const edge1 = v1.sub(v0);
	const edge2 = v2.sub(v0);
	const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
	normal.transformDirection(zoneMesh.matrixWorld);

	return normal.normalize();
}

function getAtticCenterWorld() {
	const { atticCore } = getGeometryState();
	if (!atticCore?.geometry) {
		return new THREE.Vector3(0, 0, 0);
	}

	atticCore.geometry.computeBoundingBox();
	const bounds = atticCore.geometry.boundingBox;
	if (!bounds) {
		return new THREE.Vector3(0, 0, 0);
	}

	const center = bounds.getCenter(new THREE.Vector3());
	return atticCore.localToWorld(center);
}

function resolveOutwardRoofNormal(zoneMesh, surfacePoint, candidateNormal = null) {
	let roofNormal = candidateNormal?.clone?.() || getExhaustZoneNormal(zoneMesh);
	if (!Number.isFinite(roofNormal.x) || !Number.isFinite(roofNormal.y) || !Number.isFinite(roofNormal.z) || roofNormal.lengthSq() < 0.000001) {
		roofNormal = new THREE.Vector3(0, 1, 0);
	} else {
		roofNormal.normalize();
	}

	const atticCenter = getAtticCenterWorld();
	const outwardHint = surfacePoint.clone().sub(atticCenter);
	if (outwardHint.lengthSq() > 0.000001 && roofNormal.dot(outwardHint) < 0) {
		roofNormal.multiplyScalar(-1);
	}

	return roofNormal;
}

function placeIntakeVentAt(line, zPosition) {
	const lineBounds = getLineZBounds(line);
	if (!lineBounds) {
		return false;
	}

	const side = line.name === "rightIntakePlacement" ? "right" : "left";
	const clampedZ = THREE.MathUtils.clamp(zPosition, lineBounds.zMin, lineBounds.zMax);
	const minCenterSpacing = INTAKE_LENGTH_FEET * 0.9;

	const duplicateOnSameSide = intakeVents.some((vent) => {
		if (vent.side !== side) {
			return false;
		}

		return Math.abs(vent.position.z - clampedZ) < minCenterSpacing;
	});

	if (duplicateOnSameSide) {
		return false;
	}

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(INTAKE_WIDTH_FEET, INTAKE_HEIGHT_FEET, INTAKE_LENGTH_FEET),
		new THREE.MeshStandardMaterial({ color: INTAKE_COLOR, emissive: 0x09353a, emissiveIntensity: 0.35 })
	);
	ventMesh.position.set(lineBounds.start.x, lineBounds.start.y + 0.03, clampedZ);
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

function placeStaticVentAt(line, zoneMesh, zPosition) {
	const lineBounds = getLineZBounds(line);
	if (!lineBounds || !zoneMesh) {
		return false;
	}

	const side = line.name === "leftStaticPlacementLine" ? "left" : "right";
	const clampedZ = THREE.MathUtils.clamp(zPosition, lineBounds.zMin, lineBounds.zMax);

	const surfacePoint = new THREE.Vector3(lineBounds.start.x, lineBounds.start.y, clampedZ);
	const roofNormal = resolveOutwardRoofNormal(zoneMesh, surfacePoint);
	const placedPosition = surfacePoint.clone().addScaledVector(roofNormal, STATIC_SURFACE_OFFSET_FEET);

	if (isDuplicateStaticVent(placedPosition)) {
		return false;
	}

	const orientation = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		roofNormal
	);

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(STATIC_SIZE_FEET, STATIC_HEIGHT_FEET, STATIC_SIZE_FEET),
		new THREE.MeshStandardMaterial({
			color: STATIC_COLOR,
			emissive: 0x220000,
			emissiveIntensity: 0.4,
			roughness: 0.6,
			metalness: 0
		})
	);

	ventMesh.quaternion.copy(orientation);
	ventMesh.position.copy(placedPosition);
	ventMesh.name = "staticVent";
	scene.add(ventMesh);

	staticVents.push({
		type: "static",
		side,
		position: ventMesh.position.clone(),
		surfaceNormal: roofNormal.clone().normalize(),
		orientation: ventMesh.quaternion.clone(),
		openingSizeFeet: STATIC_SIZE_FEET,
		mesh: ventMesh
	});

	return true;
}

function placeRidgeVentSegment(startPoint, endPoint) {
	if (!startPoint || !endPoint) {
		return false;
	}

	const length = startPoint.distanceTo(endPoint);
	if (length < 0.08 || isDuplicateRidgeSegment(startPoint, endPoint)) {
		return false;
	}

	const ridgeGroup = createRidgeVentGeometry(startPoint, endPoint);
	scene.add(ridgeGroup);

	ridgeVents.push({
		type: "ridge",
		position: startPoint.clone().add(endPoint).multiplyScalar(0.5),
		orientation: new THREE.Vector3(0, 0, 1),
		start: startPoint.clone(),
		end: endPoint.clone(),
		length,
		width: RIDGE_WIDTH_FEET,
		mesh: ridgeGroup
	});

	return true;
}

function createLineSampleZ(line, desiredSpacingFeet = 12, edgeInsetFeet = 1) {
	const lineBounds = getLineZBounds(line);
	if (!lineBounds) {
		return [];
	}

	const usableStart = lineBounds.zMin + edgeInsetFeet;
	const usableEnd = lineBounds.zMax - edgeInsetFeet;
	const usableLength = Math.max(0, usableEnd - usableStart);

	if (usableLength <= 0) {
		return [(lineBounds.zMin + lineBounds.zMax) / 2];
	}

	const desiredSpacing = Math.max(4, desiredSpacingFeet);
	const count = Math.max(2, Math.floor(usableLength / desiredSpacing) + 1);
	const positions = [];

	for (let i = 0; i < count; i += 1) {
		const t = count === 1 ? 0.5 : i / (count - 1);
		positions.push(usableStart + (usableLength * t));
	}

	return positions;
}

function getLineLength(line) {
	const bounds = getLineZBounds(line);
	if (!bounds) {
		return 0;
	}

	return bounds.end.distanceTo(bounds.start);
}

function getMaxVentCountOnLine(line, edgeInsetFeet, minSpacingFeet) {
	const length = getLineLength(line);
	const usableLength = Math.max(0, length - (edgeInsetFeet * 2));

	if (usableLength <= 0) {
		return 1;
	}

	return Math.max(1, Math.floor(usableLength / minSpacingFeet) + 1);
}

function createEvenlySpacedZForCount(line, count, edgeInsetFeet = 1, minSpacingFeet = 1) {
	if (!line || count <= 0) {
		return [];
	}

	const bounds = getLineZBounds(line);
	if (!bounds) {
		return [];
	}

	const maxCount = getMaxVentCountOnLine(line, edgeInsetFeet, minSpacingFeet);
	const safeCount = Math.min(count, maxCount);

	if (safeCount <= 1) {
		return [(bounds.zMin + bounds.zMax) / 2];
	}

	const start = bounds.zMin + edgeInsetFeet;
	const end = bounds.zMax - edgeInsetFeet;
	const span = Math.max(0, end - start);

	if (span === 0) {
		return [(bounds.zMin + bounds.zMax) / 2];
	}

	const positions = [];
	for (let i = 0; i < safeCount; i += 1) {
		const t = safeCount === 1 ? 0.5 : i / (safeCount - 1);
		positions.push(start + (span * t));
	}

	return positions;
}

function splitCountAcrossSides(totalCount) {
	const left = Math.ceil(totalCount / 2);
	const right = Math.floor(totalCount / 2);
	return { left, right };
}

function getRoundedRidgeLengthCandidates(targetLength, maxLength, step = 0.5) {
	const safeStep = Math.max(0.25, step);
	const clampedTarget = THREE.MathUtils.clamp(targetLength, 0, maxLength);
	const lower = Math.floor(clampedTarget / safeStep) * safeStep;
	const upper = Math.ceil(clampedTarget / safeStep) * safeStep;
	const rounded = Math.round(clampedTarget / safeStep) * safeStep;

	const candidates = new Set([
		THREE.MathUtils.clamp(lower, 0, maxLength),
		THREE.MathUtils.clamp(rounded, 0, maxLength),
		THREE.MathUtils.clamp(upper, 0, maxLength)
	]);

	return Array.from(candidates);
}

function vector3ToPlainObject(vector) {
	if (!vector) {
		return null;
	}

	return {
		x: Number(vector.x),
		y: Number(vector.y),
		z: Number(vector.z)
	};
}

function exportCurrentVentLayout() {
	return {
		version: 1,
		intake: intakeVents.map((vent) => ({
			side: vent.side,
			z: vent.position.z
		})),
		static: staticVents.map((vent) => ({
			side: vent.side,
			z: vent.position.z,
			surfaceNormal: vector3ToPlainObject(vent.surfaceNormal)
		})),
		ridge: ridgeVents.map((vent) => ({
			start: { x: vent.start.x, y: vent.start.y, z: vent.start.z },
			end: { x: vent.end.x, y: vent.end.y, z: vent.end.z }
		}))
	};
}

function restoreVentLayout(layout) {
	if (!layout || typeof layout !== "object") {
		return false;
	}

	const intakeEntries = Array.isArray(layout.intake) ? layout.intake : [];
	const staticEntries = Array.isArray(layout.static) ? layout.static : [];
	const ridgeEntries = Array.isArray(layout.ridge) ? layout.ridge : [];

	const {
		currentGeometryParams,
		leftStaticPlacementLine,
		rightStaticPlacementLine,
		leftExhaustZone,
		rightExhaustZone,
		ridgeCenterLine
	} = getGeometryState();
	const roofType = currentGeometryParams?.roofType || "gable";
	const intakePlacementLines = getAvailableIntakePlacementLines();

	if (!intakePlacementLines.length || !leftStaticPlacementLine || !rightStaticPlacementLine) {
		return false;
	}

	clearAllVents();

	for (const intake of intakeEntries) {
		if (!Number.isFinite(Number(intake?.z))) {
			continue;
		}

		const line = getIntakePlacementLineForStoredSide(intake.side);
		if (!line) {
			continue;
		}
		placeIntakeVentAt(line, Number(intake.z));
	}

	for (const exhaust of staticEntries) {
		if (!Number.isFinite(Number(exhaust?.z))) {
			continue;
		}

		const line = exhaust.side === "left" ? leftStaticPlacementLine : rightStaticPlacementLine;
		const zone = exhaust.side === "left" ? leftExhaustZone : rightExhaustZone;
		placeStaticVentAt(line, zone, Number(exhaust.z));
	}

	if (roofType !== "shed" && ridgeCenterLine) {
		const ridgeBounds = getLineZBounds(ridgeCenterLine);
		for (const ridge of ridgeEntries) {
			if (!ridgeBounds) {
				continue;
			}

			if (!Number.isFinite(Number(ridge?.start?.z)) || !Number.isFinite(Number(ridge?.end?.z))) {
				continue;
			}

			const startZ = THREE.MathUtils.clamp(Number(ridge.start?.z), ridgeBounds.zMin, ridgeBounds.zMax);
			const endZ = THREE.MathUtils.clamp(Number(ridge.end?.z), ridgeBounds.zMin, ridgeBounds.zMax);

			const startPoint = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, startZ);
			const endPoint = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, endZ);
			placeRidgeVentSegment(startPoint, endPoint);
		}
	}

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function getPresetRoofType() {
	return getGeometryRoofType();
}

function getShedManualStaticPlacementTarget() {
	const {
		leftStaticPlacementLine,
		rightStaticPlacementLine,
		leftExhaustZone,
		rightExhaustZone
	} = getGeometryState();

	const zone = leftExhaustZone || rightExhaustZone;
	if (!zone) {
		return { line: null, zone: null };
	}

	const line = zone.name === "leftExhaustZone"
		? leftStaticPlacementLine
		: rightStaticPlacementLine;

	return {
		line,
		zone
	};
}

function applyGableIntakeOnlyPreset() {
	const { leftIntakePlacement, rightIntakePlacement } = getGeometryState();
	if (!leftIntakePlacement || !rightIntakePlacement) {
		return false;
	}

	clearAllVents();

	const leftPositions = createLineSampleZ(leftIntakePlacement, 10, 1.2);
	const rightPositions = createLineSampleZ(rightIntakePlacement, 10, 1.2);

	leftPositions.forEach((z) => placeIntakeVentAt(leftIntakePlacement, z));
	rightPositions.forEach((z) => placeIntakeVentAt(rightIntakePlacement, z));

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyShedIntakeOnlyPreset() {
	const { intakeEdgeLine } = getGeometryState();
	if (!intakeEdgeLine) {
		return false;
	}

	clearAllVents();

	const lowSidePositions = createLineSampleZ(intakeEdgeLine, 10, 1.2);
	lowSidePositions.forEach((z) => placeIntakeVentAt(intakeEdgeLine, z));

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyHipIntakeOnlyPreset() {
	return applyGableIntakeOnlyPreset();
}

function generateIntakeOnlyPreset() {
	const roofType = getPresetRoofType();

	if (roofType === "gable") return applyGableIntakeOnlyPreset();
	if (roofType === "shed") return applyShedIntakeOnlyPreset();
	if (roofType === "hip") return applyHipIntakeOnlyPreset();

	return false;
}

function applyGableExhaustOnlyPreset() {
	const {
		leftStaticPlacementLine,
		leftExhaustZone,
		ridgeCenterLine
	} = getGeometryState();

	if (!ridgeCenterLine) {
		return false;
	}

	clearAllVents();

	let placedExhaust = false;
	const ridgeBounds = getLineZBounds(ridgeCenterLine);
	if (ridgeBounds) {
		const ridgeStart = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeBounds.zMin + 1);
		const ridgeEnd = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeBounds.zMax - 1);
		placedExhaust = placeRidgeVentSegment(ridgeStart, ridgeEnd);
	}

	if (!placedExhaust && leftStaticPlacementLine && leftExhaustZone) {
		const fallbackPositions = createEvenlySpacedZForCount(leftStaticPlacementLine, 2, 1.5, STATIC_SIZE_FEET * 0.9);
		fallbackPositions.forEach((z) => {
			if (placeStaticVentAt(leftStaticPlacementLine, leftExhaustZone, z)) {
				placedExhaust = true;
			}
		});
	}

	cancelPendingRidgePlacement();
	hideVentPreview();
	return placedExhaust;
}

function applyShedExhaustOnlyPreset() {
	const { line: highSideLine, zone: highSideZone } = getShedManualStaticPlacementTarget();

	if (!highSideLine || !highSideZone) {
		return false;
	}

	clearAllVents();

	let placedExhaust = false;
	const fallbackPositions = createEvenlySpacedZForCount(highSideLine, 4, 1.5, STATIC_SIZE_FEET * 0.9);
	fallbackPositions.forEach((z) => {
		if (placeStaticVentAt(highSideLine, highSideZone, z)) {
			placedExhaust = true;
		}
	});

	cancelPendingRidgePlacement();
	hideVentPreview();
	return placedExhaust;
}

function applyHipExhaustOnlyPreset() {
	return applyGableExhaustOnlyPreset();
}

function generateExhaustOnlyPreset() {
	const roofType = getPresetRoofType();

	if (roofType === "gable") return applyGableExhaustOnlyPreset();
	if (roofType === "shed") return applyShedExhaustOnlyPreset();
	if (roofType === "hip") return applyHipExhaustOnlyPreset();

	return false;
}

function applyGableBalancedPreset({ ventilationRule = "1/150" } = {}) {
	const {
		currentGeometryParams,
		leftIntakePlacement,
		rightIntakePlacement,
		leftStaticPlacementLine,
		rightStaticPlacementLine,
		leftExhaustZone,
		rightExhaustZone,
		ridgeCenterLine
	} = getGeometryState();

	if (
		!currentGeometryParams ||
		!leftIntakePlacement ||
		!rightIntakePlacement ||
		!leftStaticPlacementLine ||
		!rightStaticPlacementLine ||
		!ridgeCenterLine
	) {
		return false;
	}

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredIntakeIn2 = calculateRequiredIntake(requiredVentilationIn2);
	const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentilationIn2);

	const intakeMinSpacing = INTAKE_LENGTH_FEET * 0.9;
	const staticMinSpacing = STATIC_SIZE_FEET * 0.9;
	const intakeInset = 1;
	const staticInset = 1.5;
	const ridgeInset = 1;
	const ridgeStepFeet = 0.5;

	const maxIntakeLeft = getMaxVentCountOnLine(leftIntakePlacement, intakeInset, intakeMinSpacing);
	const maxIntakeRight = getMaxVentCountOnLine(rightIntakePlacement, intakeInset, intakeMinSpacing);
	const maxStaticLeft = getMaxVentCountOnLine(leftStaticPlacementLine, staticInset, staticMinSpacing);
	const maxStaticRight = getMaxVentCountOnLine(rightStaticPlacementLine, staticInset, staticMinSpacing);
	const maxIntakeTotal = maxIntakeLeft + maxIntakeRight;
	const preferredStaticSide = maxStaticLeft >= maxStaticRight ? "left" : "right";
	const preferredStaticLine = preferredStaticSide === "left" ? leftStaticPlacementLine : rightStaticPlacementLine;
	const preferredStaticZone = preferredStaticSide === "left" ? leftExhaustZone : rightExhaustZone;
	const preferredStaticMax = preferredStaticSide === "left" ? maxStaticLeft : maxStaticRight;

	const ridgeBounds = getLineZBounds(ridgeCenterLine);
	if (!ridgeBounds) {
		return false;
	}

	const maxRidgeLength = Math.max(0, (ridgeBounds.zMax - ridgeBounds.zMin) - (ridgeInset * 2));
	const intakeTargetCount = Math.ceil(requiredIntakeIn2 / INTAKE_NFVA_IN2);
	const intakeStart = Math.max(2, intakeTargetCount - 3);
	const intakeEnd = Math.min(maxIntakeTotal, intakeTargetCount + 10);

	let bestLayout = null;

	for (let intakeCount = intakeStart; intakeCount <= intakeEnd; intakeCount += 1) {
		const intakeNFVA = intakeCount * INTAKE_NFVA_IN2;

		const staticStart = 0;
		const staticEnd = Math.min(preferredStaticMax, Math.ceil(requiredExhaustIn2 / STATIC_NFVA_IN2) + 4);

		for (let staticCount = staticStart; staticCount <= staticEnd; staticCount += 1) {
			const staticNFVA = staticCount * STATIC_NFVA_IN2;
			const desiredExhaustNFVA = Math.max(requiredExhaustIn2, intakeNFVA);
			const desiredRidgeLength = (desiredExhaustNFVA - staticNFVA) / RIDGE_NFVA_PER_FOOT_IN2;
			const ridgeCandidates = getRoundedRidgeLengthCandidates(desiredRidgeLength, maxRidgeLength, ridgeStepFeet);

			for (const ridgeLength of ridgeCandidates) {
				const exhaustNFVA = staticNFVA + (ridgeLength * RIDGE_NFVA_PER_FOOT_IN2);
				const intakeDeficit = Math.max(0, requiredIntakeIn2 - intakeNFVA);
				const exhaustDeficit = Math.max(0, requiredExhaustIn2 - exhaustNFVA);
				const deficiencyPenalty = ((intakeDeficit + exhaustDeficit) * 1000);
				const balancePenalty = Math.abs(intakeNFVA - exhaustNFVA) * 8;
				const requiredGapPenalty = (
					Math.abs(intakeNFVA - requiredIntakeIn2) +
					Math.abs(exhaustNFVA - requiredExhaustIn2)
				) * 2;
				const overagePenalty = (
					Math.max(0, intakeNFVA - requiredIntakeIn2) +
					Math.max(0, exhaustNFVA - requiredExhaustIn2)
				) * 0.3;
				const visualPenalty = (intakeCount * 0.5) + (staticCount * 4) + (ridgeLength > 0 ? 1 : 0);

				const score = deficiencyPenalty + balancePenalty + requiredGapPenalty + overagePenalty + visualPenalty;

				if (!bestLayout || score < bestLayout.score) {
					bestLayout = {
						score,
						intakeCount,
						staticCount,
						ridgeLength,
						intakeNFVA,
						exhaustNFVA
					};
				}
			}
		}
	}

	if (!bestLayout) {
		return false;
	}

	clearAllVents();

	const intakeSplit = splitCountAcrossSides(bestLayout.intakeCount);
	const intakeLeft = createEvenlySpacedZForCount(
		leftIntakePlacement,
		Math.min(intakeSplit.left, maxIntakeLeft),
		intakeInset,
		intakeMinSpacing
	);
	const intakeRight = createEvenlySpacedZForCount(
		rightIntakePlacement,
		Math.min(intakeSplit.right, maxIntakeRight),
		intakeInset,
		intakeMinSpacing
	);

	intakeLeft.forEach((z) => placeIntakeVentAt(leftIntakePlacement, z));
	intakeRight.forEach((z) => placeIntakeVentAt(rightIntakePlacement, z));

	if (bestLayout.staticCount > 0) {
		const staticPositions = createEvenlySpacedZForCount(
			preferredStaticLine,
			bestLayout.staticCount,
			staticInset,
			staticMinSpacing
		);

		staticPositions.forEach((z) => placeStaticVentAt(preferredStaticLine, preferredStaticZone, z));
	}

	if (bestLayout.ridgeLength > 0.01) {
		const ridgeMid = (ridgeBounds.zMin + ridgeBounds.zMax) / 2;
		const halfLength = bestLayout.ridgeLength / 2;
		const ridgeStartZ = THREE.MathUtils.clamp(ridgeMid - halfLength, ridgeBounds.zMin + ridgeInset, ridgeBounds.zMax - ridgeInset);
		const ridgeEndZ = THREE.MathUtils.clamp(ridgeMid + halfLength, ridgeBounds.zMin + ridgeInset, ridgeBounds.zMax - ridgeInset);

		if (ridgeEndZ - ridgeStartZ > 0.08) {
			const ridgeStart = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeStartZ);
			const ridgeEnd = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeEndZ);
			placeRidgeVentSegment(ridgeStart, ridgeEnd);
		}
	}

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyShedBalancedPreset({ ventilationRule = "1/150" } = {}) {
	const {
		currentGeometryParams,
		intakeEdgeLine
	} = getGeometryState();
	const { line: exhaustStaticLine, zone: exhaustStaticZone } = getShedManualStaticPlacementTarget();

	if (!currentGeometryParams || !intakeEdgeLine || !exhaustStaticLine || !exhaustStaticZone) {
		return false;
	}

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredIntakeIn2 = calculateRequiredIntake(requiredVentilationIn2);
	const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentilationIn2);

	const intakeCount = Math.max(2, Math.ceil(requiredIntakeIn2 / INTAKE_NFVA_IN2));
	const staticCount = Math.max(2, Math.ceil(requiredExhaustIn2 / STATIC_NFVA_IN2));

	clearAllVents();

	const intakePositions = createEvenlySpacedZForCount(
		intakeEdgeLine,
		intakeCount,
		1,
		INTAKE_LENGTH_FEET * 0.9
	);
	const exhaustPositions = createEvenlySpacedZForCount(
		exhaustStaticLine,
		staticCount,
		1.5,
		STATIC_SIZE_FEET * 0.9
	);

	intakePositions.forEach((z) => placeIntakeVentAt(intakeEdgeLine, z));
	exhaustPositions.forEach((z) => placeStaticVentAt(exhaustStaticLine, exhaustStaticZone, z));

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyHipBalancedPreset({ ventilationRule = "1/150" } = {}) {
	return applyGableBalancedPreset({ ventilationRule });
}

function generateBalancedPreset({ ventilationRule = "1/150" } = {}) {
	const roofType = getPresetRoofType();

	if (roofType === "gable") return applyGableBalancedPreset({ ventilationRule });
	if (roofType === "shed") return applyShedBalancedPreset({ ventilationRule });
	if (roofType === "hip") return applyHipBalancedPreset({ ventilationRule });

	return false;
}

export {
	intakeVents,
	staticVents,
	ridgeVents,
	initializeVentPreview,
	updateVentPreview,
	hideVentPreview,
	clearVentPreview,
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
	getPlacedRidgeVents,
	getCurrentPreviewValidity,
	hasStaticVentConflict,
	exportCurrentVentLayout,
	restoreVentLayout,
	generateIntakeOnlyPreset,
	generateExhaustOnlyPreset,
	generateBalancedPreset
};