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
import { validateRoofType } from "../main.js";
import {
	getRoofTypeCapabilities,
	isPlacementModeSupported,
	isPresetSupported,
	isRestoreFeatureSupported
} from "./roofCapabilities.js";
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
	const routing = getPlacementRoutingContract();

	if (!placementMode || placementMode === "none" || !ghostPreviewGroup || !routing) {
		hideVentPreview();
		return;
	}

	if (!isPlacementModeSupported(routing.roofType, placementMode, { hasRidgeReference: Boolean(routing.ridgeLine) })) {
		hideVentPreview();
		return;
	}

	setRayFromPointer(camera, pointerNdc);

	if (placementMode === "intake") {
		const intakePlacementLines = routing.intakeTargets.map((target) => target.line);
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
		if (!routing.staticTargets.length) {
			hideVentPreview();
			return;
		}

		const zoneHits = raycaster.intersectObjects(routing.staticTargets.map((target) => target.zone), false);
		if (!zoneHits.length) {
			hideVentPreview();
			return;
		}

		const zoneHit = zoneHits[0];
		const zone = zoneHit.object;
		const target = routing.staticTargets.find((candidate) => candidate.zone === zone);
		if (!target?.line) {
			hideVentPreview();
			return;
		}

		let faceWorldNormal = null;
		if (zoneHit.face?.normal) {
			faceWorldNormal = zoneHit.face.normal.clone();
			const normalMatrix = new THREE.Matrix3().getNormalMatrix(zone.matrixWorld);
			faceWorldNormal.applyMatrix3(normalMatrix).normalize();
		}

		const outwardNormal = resolveOutwardRoofNormal(zone, zoneHit.point.clone(), faceWorldNormal);
		updateStaticPreview(zoneHit.point, target.line, outwardNormal, zone);
		return;
	}

	if (placementMode === "ridge") {
		if (!routing.ridgeLine) {
			hideVentPreview();
			return;
		}

		const hits = raycaster.intersectObject(routing.ridgeLine, false);
		if (!hits.length) {
			hideVentPreview();
			return;
		}

		const snappedPoint = getSnappedPointOnRidge(hits[0].point, routing.ridgeLine);
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
	const roofType = currentGeometryParams?.roofType;
	if (!roofType) {
		console.error(
			"[RoofFlo Vents] Roof type not available in geometry state. " +
			"Geometry may not be initialized. Vent operations cannot proceed."
		);
		return null;
	}
	try {
		return validateRoofType(roofType);
	} catch (error) {
		console.error("[RoofFlo Vents]", error.message);
		return null;
	}
}

function getPlacementRoutingContract() {
	const geometryState = getGeometryState();
	const roofType = getGeometryRoofType();

	if (!roofType) {
		return null;
	}

	const placementReferences = geometryState.placementReferences || {};
	const intakeTargets = resolveIntakeTargets(placementReferences.intake, roofType);
	const staticTargets = resolveStaticTargets(placementReferences.exhaust, roofType);
	const ridgeLine = placementReferences.ridge || placementReferences.exhaust?.ridge || null;
	const capabilities = getRoofTypeCapabilities(roofType);

	return {
		roofType,
		capabilities,
		intakeTargets,
		staticTargets,
		ridgeLine
	};
}

function resolveIntakeTargets(intakeReferences, roofType) {
	if (!intakeReferences || typeof intakeReferences !== "object") {
		return [];
	}

	if (Array.isArray(intakeReferences.targets) && intakeReferences.targets.length) {
		return intakeReferences.targets
			.filter((target) => target?.line)
			.map((target, index) => {
				const key = String(target.key || `intake-${index}`);
				return {
					key,
					side: mapIntakeKeyToStoredSide(key, roofType),
					line: target.line
				};
			});
	}

	const fallbackLines = [
		intakeReferences.primary,
		intakeReferences.secondary,
		...(Array.isArray(intakeReferences.perimeter) ? intakeReferences.perimeter : []),
		...(Array.isArray(intakeReferences.legacy) ? intakeReferences.legacy : [])
	].filter(Boolean);

	return fallbackLines.map((line, index) => {
		const key = String(line?.name || `intake-${index}`);
		return {
			key,
			side: mapIntakeKeyToStoredSide(key, roofType),
			line
		};
	});
}

function resolveStaticTargets(exhaustReferences, roofType) {
	if (!exhaustReferences || typeof exhaustReferences !== "object") {
		return [];
	}

	if (Array.isArray(exhaustReferences.targets) && exhaustReferences.targets.length) {
		return exhaustReferences.targets
			.filter((target) => target?.line && target?.zone)
			.map((target, index) => {
				const key = String(target.key || `static-${index}`);
				return {
					key,
					side: mapStaticKeyToStoredSide(key, roofType),
					line: target.line,
					zone: target.zone
				};
			});
	}

	return [];
}

function mapIntakeKeyToStoredSide(key, roofType) {
	if (roofType === "shed") {
		return "low";
	}

	if (key === "right" || key.toLowerCase().includes("right")) {
		return "right";
	}

	if (roofType === "gable") {
		return "left";
	}

	return key;
}

function mapStaticKeyToStoredSide(key, roofType) {
	if (roofType === "shed") {
		return "high";
	}

	if (key === "right" || key.toLowerCase().includes("right")) {
		return "right";
	}

	return "left";
}

function getIntakeTargetByLine(line) {
	if (!line) {
		return null;
	}

	const routing = getPlacementRoutingContract();
	if (!routing) {
		return null;
	}

	return routing.intakeTargets.find((target) => target.line === line) || null;
}

function getIntakeTargetByStoredData(side, referenceKey = null) {
	const routing = getPlacementRoutingContract();
	if (!routing) {
		return null;
	}

	if (referenceKey) {
		const byKey = routing.intakeTargets.find((target) => target.key === referenceKey);
		if (byKey) {
			return byKey;
		}
	}

	if (side) {
		const bySide = routing.intakeTargets.find((target) => target.side === side);
		if (bySide) {
			return bySide;
		}
	}

	return routing.intakeTargets[0] || null;
}

function getStaticTargetByStoredSide(side, referenceKey = null) {
	const routing = getPlacementRoutingContract();
	if (!routing || !routing.staticTargets.length) {
		return null;
	}

	if (referenceKey) {
		const byKey = routing.staticTargets.find((target) => target.key === referenceKey);
		if (byKey) {
			return byKey;
		}
	}

	if (side) {
		const bySide = routing.staticTargets.find((target) => target.side === side);
		if (bySide) {
			return bySide;
		}
	}

	return routing.staticTargets[0] || null;
}

function getPrimaryStaticTarget() {
	const routing = getPlacementRoutingContract();
	if (!routing || !routing.staticTargets.length) {
		return null;
	}

	return routing.staticTargets[0];
}

function getIntakeSideForLine(line) {
	const target = getIntakeTargetByLine(line);
	return target?.side || null;
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

	const routing = getPlacementRoutingContract();
	if (!routing || !isPlacementModeSupported(routing.roofType, "intake", { hasRidgeReference: Boolean(routing.ridgeLine) })) {
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

	const intakeTarget = getIntakeTargetByLine(intakePreviewPlacementLine);
	if (!intakeTarget) {
		return false;
	}

	const ventMesh = new THREE.Mesh(
		new THREE.BoxGeometry(INTAKE_WIDTH_FEET, INTAKE_HEIGHT_FEET, INTAKE_LENGTH_FEET),
		new THREE.MeshStandardMaterial({ color: INTAKE_COLOR, emissive: 0x09353a, emissiveIntensity: 0.35 })
	);
	ventMesh.position.copy(position);
	ventMesh.name = "intakeVent";
	scene.add(ventMesh);

	intakeVents.push({
		type: "intake",
		side: intakeTarget.side,
		referenceKey: intakeTarget.key,
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

	const routing = getPlacementRoutingContract();
	if (!routing || !isPlacementModeSupported(routing.roofType, "static", { hasRidgeReference: Boolean(routing.ridgeLine) })) {
		return false;
	}

	if (!staticPreviewSnappedPoint || !staticPreviewNormal || !staticPreviewPlacementLine || !staticPreviewZoneMesh) {
		return false;
	}

	// Route manual placement through the shared static transform path.
	const staticTarget = routing.staticTargets.find((target) => (
		target.line === staticPreviewPlacementLine && target.zone === staticPreviewZoneMesh
	));

	if (!staticTarget) {
		return false;
	}

	return placeStaticVentAt(
		staticPreviewPlacementLine,
		staticPreviewZoneMesh,
		Number(staticPreviewSnappedPoint.z),
		{ side: staticTarget.side, referenceKey: staticTarget.key }
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

	const routing = getPlacementRoutingContract();
	if (!routing || !isPlacementModeSupported(routing.roofType, "ridge", { hasRidgeReference: Boolean(routing.ridgeLine) })) {
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

function placeIntakeVentAt(line, zPosition, { side = null, referenceKey = null } = {}) {
	const lineBounds = getLineZBounds(line);
	if (!lineBounds) {
		return false;
	}

	const intakeTarget = getIntakeTargetByLine(line);
	const resolvedSide = side || intakeTarget?.side || "left";
	const resolvedReferenceKey = referenceKey || intakeTarget?.key || line.name || null;
	const clampedZ = THREE.MathUtils.clamp(zPosition, lineBounds.zMin, lineBounds.zMax);
	const minCenterSpacing = INTAKE_LENGTH_FEET * 0.9;

	const duplicateOnSameSide = intakeVents.some((vent) => {
		if (vent.side !== resolvedSide) {
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
		side: resolvedSide,
		referenceKey: resolvedReferenceKey,
		position: ventMesh.position.clone(),
		orientation: new THREE.Vector3(0, 0, 1),
		width: INTAKE_WIDTH_FEET,
		length: INTAKE_LENGTH_FEET,
		mesh: ventMesh
	});

	return true;
}

function placeStaticVentAt(line, zoneMesh, zPosition, { side = null, referenceKey = null } = {}) {
	const lineBounds = getLineZBounds(line);
	if (!lineBounds || !zoneMesh) {
		return false;
	}

	const routing = getPlacementRoutingContract();
	const target = routing?.staticTargets.find((candidate) => candidate.line === line && candidate.zone === zoneMesh);
	const resolvedSide = side || target?.side || "left";
	const resolvedReferenceKey = referenceKey || target?.key || line.name || null;
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
		side: resolvedSide,
		referenceKey: resolvedReferenceKey,
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
			referenceKey: vent.referenceKey || null,
			z: vent.position.z
		})),
		static: staticVents.map((vent) => ({
			side: vent.side,
			referenceKey: vent.referenceKey || null,
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

	const { currentGeometryParams } = getGeometryState();
	
	const roofTypeRaw = currentGeometryParams?.roofType;
	let roofType;
	try {
		roofType = roofTypeRaw ? validateRoofType(roofTypeRaw) : null;
	} catch (error) {
		console.error("[RoofFlo Vents]", error.message);
		roofType = null;
	}
	
	if (!roofType) {
		console.error("[RoofFlo Vents] Cannot restore vent layout: roof type is invalid.");
		return false;
	}

	const routing = getPlacementRoutingContract();
	if (!routing) {
		return false;
	}

	const hasRidgeReference = Boolean(routing.ridgeLine);
	if (isRestoreFeatureSupported(roofType, "intake", { hasRidgeReference }) && !routing.intakeTargets.length) {
		return false;
	}

	clearAllVents();

	if (isRestoreFeatureSupported(roofType, "intake", { hasRidgeReference })) {
	for (const intake of intakeEntries) {
		if (!Number.isFinite(Number(intake?.z))) {
			continue;
		}

		const intakeTarget = getIntakeTargetByStoredData(intake.side, intake.referenceKey || null);
		if (!intakeTarget?.line) {
			continue;
		}
		placeIntakeVentAt(intakeTarget.line, Number(intake.z), {
			side: intakeTarget.side,
			referenceKey: intakeTarget.key
		});
	}
}

	if (isRestoreFeatureSupported(roofType, "static", { hasRidgeReference })) {
	for (const exhaust of staticEntries) {
		if (!Number.isFinite(Number(exhaust?.z))) {
			continue;
		}

		const staticTarget = getStaticTargetByStoredSide(exhaust.side, exhaust.referenceKey || null);
		if (!staticTarget?.line || !staticTarget?.zone) {
			continue;
		}

		placeStaticVentAt(staticTarget.line, staticTarget.zone, Number(exhaust.z), {
			side: staticTarget.side,
			referenceKey: staticTarget.key
		});
	}
}

	if (isRestoreFeatureSupported(roofType, "ridge", { hasRidgeReference })) {
		const ridgeBounds = getLineZBounds(routing.ridgeLine);
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
	const target = getPrimaryStaticTarget();
	return {
		line: target?.line || null,
		zone: target?.zone || null,
		side: target?.side || null,
		referenceKey: target?.key || null
	};
}

function getIntakeTargetForSide(side) {
	return getIntakeTargetByStoredData(side, null);
}

function getStaticTargetForSide(side) {
	return getStaticTargetByStoredSide(side, null);
}

function placeIntakeVentsForTarget(target, positions) {
	if (!target?.line || !Array.isArray(positions) || !positions.length) {
		return;
	}

	for (const z of positions) {
		placeIntakeVentAt(target.line, z, {
			side: target.side,
			referenceKey: target.key
		});
	}
}

function placeStaticVentsForTarget(target, positions) {
	if (!target?.line || !target?.zone || !Array.isArray(positions) || !positions.length) {
		return 0;
	}

	let placedCount = 0;
	for (const z of positions) {
		if (placeStaticVentAt(target.line, target.zone, z, {
			side: target.side,
			referenceKey: target.key
		})) {
			placedCount += 1;
		}
	}

	return placedCount;
}

function applyGableIntakeOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const { currentGeometryParams } = getGeometryState();
	const routing = getPlacementRoutingContract();
	if (!currentGeometryParams || !routing || routing.roofType !== "gable" || routing.intakeTargets.length < 2) {
		return false;
	}

	const leftTarget = getIntakeTargetForSide("left") || routing.intakeTargets[0];
	const rightTarget = getIntakeTargetForSide("right") || routing.intakeTargets[1];

	if (!leftTarget?.line || !rightTarget?.line) {
		return false;
	}

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredIntakeIn2 = calculateRequiredIntake(requiredVentilationIn2);
	const intakeCount = Math.ceil(requiredIntakeIn2 / INTAKE_NFVA_IN2);
	const intakeSplit = splitCountAcrossSides(intakeCount);
	const intakeMinSpacing = INTAKE_LENGTH_FEET * 0.9;

	const leftPositions = createEvenlySpacedZForCount(leftTarget.line, intakeSplit.left, 1, intakeMinSpacing);
	const rightPositions = createEvenlySpacedZForCount(rightTarget.line, intakeSplit.right, 1, intakeMinSpacing);

	clearAllVents();

	placeIntakeVentsForTarget(leftTarget, leftPositions);
	placeIntakeVentsForTarget(rightTarget, rightPositions);

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyShedIntakeOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const { currentGeometryParams } = getGeometryState();
	const routing = getPlacementRoutingContract();
	const intakeTarget = getIntakeTargetForSide("low") || routing?.intakeTargets?.[0] || null;
	if (!currentGeometryParams || !routing || routing.roofType !== "shed" || !intakeTarget?.line) {
		return false;
	}

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredIntakeIn2 = calculateRequiredIntake(requiredVentilationIn2);
	const intakeCount = Math.ceil(requiredIntakeIn2 / INTAKE_NFVA_IN2);

	clearAllVents();

	const lowSidePositions = createEvenlySpacedZForCount(intakeTarget.line, intakeCount, 1, INTAKE_LENGTH_FEET * 0.9);
	placeIntakeVentsForTarget(intakeTarget, lowSidePositions);

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyHipIntakeOnlyPreset() {
	return false;
}

function generateIntakeOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const roofType = getPresetRoofType();
	if (!roofType || !isPresetSupported(roofType, "intakeOnly")) {
		return false;
	}

	const applierByRoofType = {
		gable: () => applyGableIntakeOnlyPreset({ ventilationRule }),
		shed: () => applyShedIntakeOnlyPreset({ ventilationRule }),
		hip: applyHipIntakeOnlyPreset
	};

	return applierByRoofType[roofType]?.() ?? false;
}

function applyGableExhaustOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const { currentGeometryParams } = getGeometryState();
	const routing = getPlacementRoutingContract();
	if (!currentGeometryParams || !routing || routing.roofType !== "gable" || !routing.ridgeLine) {
		return false;
	}

	const staticTarget = getStaticTargetForSide("left") || routing.staticTargets[0] || null;

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentilationIn2);

	clearAllVents();

	let placedExhaust = false;
	const ridgeBounds = getLineZBounds(routing.ridgeLine);
	if (ridgeBounds) {
		const ridgeInset = 1;
		const maxRidgeLength = Math.max(0, (ridgeBounds.zMax - ridgeBounds.zMin) - (ridgeInset * 2));
		const requiredRidgeLength = Math.min(requiredExhaustIn2 / RIDGE_NFVA_PER_FOOT_IN2, maxRidgeLength);
		const ridgeMid = (ridgeBounds.zMin + ridgeBounds.zMax) / 2;
		const halfLength = requiredRidgeLength / 2;
		const ridgeStartZ = THREE.MathUtils.clamp(ridgeMid - halfLength, ridgeBounds.zMin + ridgeInset, ridgeBounds.zMax - ridgeInset);
		const ridgeEndZ = THREE.MathUtils.clamp(ridgeMid + halfLength, ridgeBounds.zMin + ridgeInset, ridgeBounds.zMax - ridgeInset);
		if (ridgeEndZ - ridgeStartZ > 0.08) {
			const ridgeStart = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeStartZ);
			const ridgeEnd = new THREE.Vector3(ridgeBounds.start.x, ridgeBounds.start.y, ridgeEndZ);
			placedExhaust = placeRidgeVentSegment(ridgeStart, ridgeEnd);
		}
	}

	if (!placedExhaust && staticTarget?.line && staticTarget?.zone) {
		const staticCount = Math.max(1, Math.ceil(requiredExhaustIn2 / STATIC_NFVA_IN2));
		const fallbackPositions = createEvenlySpacedZForCount(staticTarget.line, staticCount, 1.5, STATIC_SIZE_FEET * 0.9);
		if (placeStaticVentsForTarget(staticTarget, fallbackPositions) > 0) {
			placedExhaust = true;
		}
	}

	cancelPendingRidgePlacement();
	hideVentPreview();
	return placedExhaust;
}

function applyShedExhaustOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const { currentGeometryParams } = getGeometryState();
	const staticTarget = getStaticTargetForSide("high") || getShedManualStaticPlacementTarget();

	if (!currentGeometryParams || !staticTarget?.line || !staticTarget?.zone) {
		return false;
	}

	const atticAreaSqFt = calculateAtticArea(
		currentGeometryParams.buildingWidth,
		currentGeometryParams.buildingLength
	);
	const requiredVentilationIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
	const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentilationIn2);
	const staticCount = Math.max(1, Math.ceil(requiredExhaustIn2 / STATIC_NFVA_IN2));

	clearAllVents();

	let placedExhaust = false;
	const exhaustPositions = createEvenlySpacedZForCount(staticTarget.line, staticCount, 1.5, STATIC_SIZE_FEET * 0.9);
	if (placeStaticVentsForTarget(staticTarget, exhaustPositions) > 0) {
		placedExhaust = true;
	}

	cancelPendingRidgePlacement();
	hideVentPreview();
	return placedExhaust;
}

function applyHipExhaustOnlyPreset() {
	return false;
}

function generateExhaustOnlyPreset({ ventilationRule = "1/150" } = {}) {
	const roofType = getPresetRoofType();
	if (!roofType || !isPresetSupported(roofType, "exhaustOnly")) {
		return false;
	}

	const applierByRoofType = {
		gable: () => applyGableExhaustOnlyPreset({ ventilationRule }),
		shed: () => applyShedExhaustOnlyPreset({ ventilationRule }),
		hip: applyHipExhaustOnlyPreset
	};

	return applierByRoofType[roofType]?.() ?? false;
}

function applyGableBalancedPreset({ ventilationRule = "1/150" } = {}) {
	const { currentGeometryParams } = getGeometryState();
	const routing = getPlacementRoutingContract();

	if (!currentGeometryParams || !routing || routing.roofType !== "gable" || !routing.ridgeLine) {
		return false;
	}

	const leftIntakeTarget = getIntakeTargetForSide("left") || routing.intakeTargets[0] || null;
	const rightIntakeTarget = getIntakeTargetForSide("right") || routing.intakeTargets[1] || null;
	const leftStaticTarget = getStaticTargetForSide("left") || routing.staticTargets[0] || null;
	const rightStaticTarget = getStaticTargetForSide("right") || routing.staticTargets[1] || null;

	if (!leftIntakeTarget?.line || !rightIntakeTarget?.line || !leftStaticTarget?.line || !rightStaticTarget?.line) {
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

	const maxIntakeLeft = getMaxVentCountOnLine(leftIntakeTarget.line, intakeInset, intakeMinSpacing);
	const maxIntakeRight = getMaxVentCountOnLine(rightIntakeTarget.line, intakeInset, intakeMinSpacing);
	const maxStaticLeft = getMaxVentCountOnLine(leftStaticTarget.line, staticInset, staticMinSpacing);
	const maxStaticRight = getMaxVentCountOnLine(rightStaticTarget.line, staticInset, staticMinSpacing);
	const maxIntakeTotal = maxIntakeLeft + maxIntakeRight;
	const preferredStaticSide = maxStaticLeft >= maxStaticRight ? "left" : "right";
	const preferredStaticTarget = preferredStaticSide === "left" ? leftStaticTarget : rightStaticTarget;
	const preferredStaticLine = preferredStaticTarget.line;
	const preferredStaticZone = preferredStaticTarget.zone;
	const preferredStaticMax = preferredStaticSide === "left" ? maxStaticLeft : maxStaticRight;

	const ridgeBounds = getLineZBounds(routing.ridgeLine);
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
		leftIntakeTarget.line,
		Math.min(intakeSplit.left, maxIntakeLeft),
		intakeInset,
		intakeMinSpacing
	);
	const intakeRight = createEvenlySpacedZForCount(
		rightIntakeTarget.line,
		Math.min(intakeSplit.right, maxIntakeRight),
		intakeInset,
		intakeMinSpacing
	);

	placeIntakeVentsForTarget(leftIntakeTarget, intakeLeft);
	placeIntakeVentsForTarget(rightIntakeTarget, intakeRight);

	if (bestLayout.staticCount > 0) {
		const staticPositions = createEvenlySpacedZForCount(
			preferredStaticLine,
			bestLayout.staticCount,
			staticInset,
			staticMinSpacing
		);

		placeStaticVentsForTarget(preferredStaticTarget, staticPositions);
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
	const { currentGeometryParams } = getGeometryState();
	const routing = getPlacementRoutingContract();
	const intakeTarget = getIntakeTargetForSide("low") || routing?.intakeTargets?.[0] || null;
	const exhaustTarget = getStaticTargetForSide("high") || getShedManualStaticPlacementTarget();

	if (!currentGeometryParams || !routing || routing.roofType !== "shed" || !intakeTarget?.line || !exhaustTarget?.line || !exhaustTarget?.zone) {
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
		intakeTarget.line,
		intakeCount,
		1,
		INTAKE_LENGTH_FEET * 0.9
	);
	const exhaustPositions = createEvenlySpacedZForCount(
		exhaustTarget.line,
		staticCount,
		1.5,
		STATIC_SIZE_FEET * 0.9
	);

	placeIntakeVentsForTarget(intakeTarget, intakePositions);
	placeStaticVentsForTarget(exhaustTarget, exhaustPositions);

	cancelPendingRidgePlacement();
	hideVentPreview();
	return true;
}

function applyHipBalancedPreset({ ventilationRule = "1/150" } = {}) {
	return false;
}

function generateBalancedPreset({ ventilationRule = "1/150" } = {}) {
	const roofType = getPresetRoofType();
	if (!roofType || !isPresetSupported(roofType, "balanced")) {
		return false;
	}

	const applierByRoofType = {
		gable: () => applyGableBalancedPreset({ ventilationRule }),
		shed: () => applyShedBalancedPreset({ ventilationRule }),
		hip: () => applyHipBalancedPreset({ ventilationRule })
	};

	return applierByRoofType[roofType]?.() ?? false;
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