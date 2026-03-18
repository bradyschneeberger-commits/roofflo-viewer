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

function updateStaticPreview(hitPoint, placementLine, roofNormal) {
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
		leftIntakePlacement,
		rightIntakePlacement,
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
		if (!leftIntakePlacement || !rightIntakePlacement) {
			hideVentPreview();
			return;
		}

		const hits = raycaster.intersectObjects([leftIntakePlacement, rightIntakePlacement], false);
		if (!hits.length) {
			hideVentPreview();
			return;
		}

		updateIntakePreview(hits[0].point, hits[0].object);
		return;
	}

	if (placementMode === "static") {
		if (!leftStaticPlacementLine || !rightStaticPlacementLine) {
			hideVentPreview();
			return;
		}

		const hits = raycaster.intersectObjects([leftStaticPlacementLine, rightStaticPlacementLine], false);
		if (!hits.length) {
			hideVentPreview();
			return;
		}

		const placementLine = hits[0].object;
		const zone = placementLine.name === "leftStaticPlacementLine" ? leftExhaustZone : rightExhaustZone;

		const worldNormal = new THREE.Vector3(0, 1, 0);
		if (zone && zone.geometry) {
			const positionAttr = zone.geometry.getAttribute("position");
			const indexAttr = zone.geometry.index;

			if (indexAttr) {
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
				worldNormal.crossVectors(edge1, edge2).normalize();
				worldNormal.transformDirection(zone.matrixWorld);
			}
		}

		updateStaticPreview(hits[0].point, placementLine, worldNormal);
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

	const side = intakePreviewPlacementLine.name === "leftIntakePlacement" ? "left" : "right";

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

	if (isDuplicateStaticVent(position)) {
		return false;
	}

	const side = staticPreviewPlacementLine.name === "leftStaticPlacementLine" ? "left" : "right";

	const orientation = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		staticPreviewNormal.clone().normalize()
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
	ventMesh.position.copy(position);
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

function isDuplicateIntakeVent(position, tolerance = 0.15) {
	return intakeVents.some((vent) => {
		const dist = vent.position.distanceTo(position);
		return dist < tolerance;
	});
}

function isDuplicateStaticVent(position, tolerance = 0.5) {
	return staticVents.some((vent) => {
		const dist = vent.position.distanceTo(position);
		return dist < tolerance;
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

	const length = startPoint.distanceTo(endPoint);
	const midpoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);

	const openingMesh = new THREE.Mesh(
		new THREE.BoxGeometry(RIDGE_WIDTH_FEET, 0.05, length),
		new THREE.MeshStandardMaterial({
			color: RIDGE_OPENING_COLOR,
			emissive: 0x330022,
			emissiveIntensity: 0.26,
			roughness: 0.5,
			metalness: 0.05
		})
	);
	openingMesh.position.copy(midpoint);
	openingMesh.position.y += 0.025;
	openingMesh.name = "ridgeOpening";
	group.add(openingMesh);

	const footprintWidth = RIDGE_WIDTH_FEET * 2.5;
	const footprintMesh = new THREE.Mesh(
		new THREE.BoxGeometry(footprintWidth, 0.04, length),
		new THREE.MeshStandardMaterial({
			color: RIDGE_BODY_COLOR,
			roughness: 0.5,
			metalness: 0.08
		})
	);
	footprintMesh.position.copy(midpoint);
	footprintMesh.position.y += 0.02;
	footprintMesh.name = "ridgeFootprint";
	group.add(footprintMesh);

	return group;
}

function tryPlaceRidgeVent() {
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
	getCurrentPreviewValidity
};