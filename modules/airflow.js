/*
RoofFlo V2
File: airflow.js

Purpose:
Simulate attic airflow using particle visualization.

Airflow Rules:
- Particles spawn only from intake vents
- Particles must remain inside:
  - intake plenums
  - attic core

Movement Phases:
1. Intake plenum phase
2. Attic airflow phase
3. Exhaust exit phase

Exit Rules:
- Particles may only exit through:
  - static vents
  - ridge vents

Simulation Controls:
Start Simulation → begin continuous particle emission
Reset → stop simulation and clear particles

Exports:
startSimulation()
stopSimulation()
updateAirflow()
*/

import * as THREE from "three";
import {
  calculateAtticArea,
  calculateRequiredVentilation,
  calculateRequiredIntake,
  calculateRequiredExhaust,
  calculateInstalledVentilation
} from "./calculations.js";
import { validateRoofType } from "../main.js";

const STALE_AIR_COLOR = 0xffa500;
const FRESH_AIR_COLOR = 0x66ccff;
const PARTICLE_SIZE = 0.032;
const PARTICLE_OPACITY = 2.5;
const MAX_TOTAL_PARTICLES = 1000;
const MIN_STALE_PARTICLES = 260;
const SPAWN_INTERVAL_SECONDS = 0.14;
const PARTICLE_MAX_AGE_SECONDS = 20;
const SPAWN_FADE_IN_SECONDS = 0.14;
const EXHAUST_FADE_OUT_SECONDS = 10;
const INITIAL_TRAPPED_PARTICLE_DENSITY = 0.24;
const MIN_INITIAL_TRAPPED_PARTICLES = 220;
const MAX_INITIAL_TRAPPED_PARTICLES = 760;
const TRAPPED_BASE_DRIFT_SPEED = 0.1;
const TRAPPED_UPWARD_BIAS = 0.08;
const WEAK_ESCAPE_STRENGTH = 0.18;
const BALANCED_DIRECTIONAL_BOOST = 1.15;
const EDIT_MODE_FRESH_SPAWN_INTERVAL_SECONDS = 0.34;
const ACTIVE_MODE_FRESH_SPAWN_INTERVAL_SECONDS = 0.14;
const INTAKE_ONLY_FRESH_TO_STALE_SECONDS = 9.5;
const GENERAL_TRAPPED_FRESH_TO_STALE_SECONDS = 7.5;
const STALE_REPLENISH_INTERVAL_SECONDS = 0.12;
const MAX_STALE_REPLENISH_PER_TICK = 4;
const STATIC_VENT_SIZE_FEET = 0.75;
const RIDGE_VENT_WIDTH_FEET = 2 / 12;
const TRAIL_HISTORY_LENGTH = 4;
const TRAIL_MIN_POINT_DISTANCE = 0.045;
const TRAIL_MIN_POINT_DISTANCE_SQ = TRAIL_MIN_POINT_DISTANCE * TRAIL_MIN_POINT_DISTANCE;
const TRAIL_SPEED_VISIBILITY_MIN = 0.08;
const TRAIL_SPEED_VISIBILITY_MAX = 1.15;
const TRAIL_SPEED_VISIBILITY_MIN_SQ = TRAIL_SPEED_VISIBILITY_MIN * TRAIL_SPEED_VISIBILITY_MIN;
const TRAIL_SPEED_VISIBILITY_MAX_SQ = TRAIL_SPEED_VISIBILITY_MAX * TRAIL_SPEED_VISIBILITY_MAX;
const TRAIL_BASE_OPACITY = 0.34;
const TRAIL_SETUP_OPACITY_MUL = 0.16;
const TRAIL_OPACITY_UPDATE_DELTA = 0.012;
const RIDGE_EXIT_RAMP_SPEED = 1.45;
const RIDGE_EXIT_MAX_LATERAL_FORCE = 0.018;
const RIDGE_EXIT_UPWARD_RETENTION = 0.992;
const RIDGE_EXIT_MIN_UPWARD_LIFT = 0.028;
const RIDGE_EXIT_FADE_DELAY = 0.35;
const RIDGE_EXIT_EXTRA_FADE_DELAY = 0.45;
const RIDGE_EXIT_EXTRA_LIFE = 0.75;
const RIDGE_EXIT_EXTRA_REMOVAL_DISTANCE = 0.45;

const PARTICLE_GEOMETRY = new THREE.SphereGeometry(1, 8, 8);
const STALE_AIR_TINT = new THREE.Color(STALE_AIR_COLOR);
const FRESH_AIR_TINT = new THREE.Color(FRESH_AIR_COLOR);
const PARTICLE_COLOR_TEMP = new THREE.Color();
const TRAIL_COLOR_TEMP = new THREE.Color();

const PHASE_VISUALS = {
  intake: {
    opacityMul: 1,
    scaleMul: 0.96,
    color: new THREE.Color(0xe4fcff)
  },
  attic: {
    opacityMul: 0.94,
    scaleMul: 1.05,
    color: new THREE.Color(0xd8fbff)
  },
  exhaust: {
    opacityMul: 1.08,
    scaleMul: 1.12,
    color: new THREE.Color(0xf2feff)
  }
};

const UP = new THREE.Vector3(0, 1, 0);
const TEMP_VEC_1 = new THREE.Vector3();
const TEMP_VEC_2 = new THREE.Vector3();
const TEMP_VEC_3 = new THREE.Vector3();
const TEMP_VEC_4 = new THREE.Vector3();

let airflowGroup = null;
let airflowTrailGroup = null;
let simulationRunning = false;
let spawnAccumulator = 0;
let editFreshSpawnAccumulator = 0;
let staleReplenishAccumulator = 0;

let sceneRef = null;
let getGeometryStateRef = null;
let getVentsRef = null;

const particles = [];

const VentilationMode = {
  NONE: "none",
  EXHAUST_ONLY: "exhaust-only",
  INTAKE_ONLY: "intake-only",
  BALANCED: "balanced"
};

function ensureAirflowGroup() {
  if (!sceneRef) {
    return;
  }

  if (!airflowGroup) {
    airflowGroup = new THREE.Group();
    airflowGroup.name = "airflowGroup";
    sceneRef.add(airflowGroup);
  }

  if (!airflowTrailGroup) {
    airflowTrailGroup = new THREE.Group();
    airflowTrailGroup.name = "airflowTrailGroup";
    airflowGroup.add(airflowTrailGroup);
  }
}

function isSimulationRunning() {
  return simulationRunning;
}

function startAirflowSimulation(context = {}) {
  if (simulationRunning) {
    return false;
  }

  sceneRef = context.scene || sceneRef;
  getGeometryStateRef = context.getGeometryState || getGeometryStateRef;
  getVentsRef = context.getVents || getVentsRef;

  if (!sceneRef || !getGeometryStateRef || !getVentsRef) {
    return false;
  }

  ensureAirflowGroup();
  simulationRunning = true;
  return true;
}

function initializeAirflowVisualization(context = {}) {
  sceneRef = context.scene || sceneRef;
  getGeometryStateRef = context.getGeometryState || getGeometryStateRef;
  getVentsRef = context.getVents || getVentsRef;

  if (!sceneRef || !getGeometryStateRef || !getVentsRef) {
    return false;
  }

  ensureAirflowGroup();
  seedInitialTrappedAir();
  return true;
}

function stopAirflowSimulation() {
  simulationRunning = false;
  spawnAccumulator = 0;
  editFreshSpawnAccumulator = 0;
  staleReplenishAccumulator = 0;
}

function disposeParticle(particle, index) {
  disposeParticleTrail(particle);

  if (particle.mesh && airflowGroup) {
    airflowGroup.remove(particle.mesh);
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
  }

  particles.splice(index, 1);
}

function clearParticles() {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    disposeParticle(particles[i], i);
  }
}

function resetAirflowSimulation() {
  stopAirflowSimulation();
  clearParticles();
  seedInitialTrappedAir();
}

function createParticleMesh(position) {
  const material = new THREE.MeshBasicMaterial({
    color: STALE_AIR_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });

  const mesh = new THREE.Mesh(
    PARTICLE_GEOMETRY,
    material
  );

  mesh.position.copy(position);
  mesh.scale.setScalar(PARTICLE_SIZE);
  mesh.renderOrder = 100;
  return mesh;
}

function createParticleTrail(position) {
  if (!airflowTrailGroup) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_HISTORY_LENGTH * 3);
  const colors = new Float32Array(TRAIL_HISTORY_LENGTH * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0,
    vertexColors: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });

  const mesh = new THREE.Line(geometry, material);
  mesh.renderOrder = 90;
  mesh.frustumCulled = false;
  airflowTrailGroup.add(mesh);

  const history = new Float32Array(TRAIL_HISTORY_LENGTH * 3);
  for (let i = 0; i < TRAIL_HISTORY_LENGTH; i += 1) {
    const index = i * 3;
    history[index] = position.x;
    history[index + 1] = position.y;
    history[index + 2] = position.z;
  }

  return {
    mesh,
    positionAttr: geometry.getAttribute("position"),
    colorAttr: geometry.getAttribute("color"),
    history,
    historyHead: 0,
    visibleCount: 1,
    lastX: position.x,
    lastY: position.y,
    lastZ: position.z,
    lastOpacity: 0,
    dirty: true
  };
}

function disposeParticleTrail(particle) {
  if (!particle?.trail?.mesh || !airflowTrailGroup) {
    return;
  }

  airflowTrailGroup.remove(particle.trail.mesh);
  particle.trail.mesh.geometry.dispose();
  particle.trail.mesh.material.dispose();
  particle.trail = null;
}

function getParticleColor(targetColor, particle) {
  const freshness = THREE.MathUtils.clamp(
    particle.freshness ?? (particle.type === "fresh" ? 1 : 0),
    0,
    1
  );
  return targetColor.copy(STALE_AIR_TINT).lerp(FRESH_AIR_TINT, freshness);
}

function recordTrailPoint(particle) {
  if (!particle?.trail) {
    return;
  }

  const trail = particle.trail;
  const dx = particle.position.x - trail.lastX;
  const dy = particle.position.y - trail.lastY;
  const dz = particle.position.z - trail.lastZ;
  const distanceSq = (dx * dx) + (dy * dy) + (dz * dz);
  if (distanceSq < TRAIL_MIN_POINT_DISTANCE_SQ) {
    return;
  }

  trail.historyHead = (trail.historyHead + TRAIL_HISTORY_LENGTH - 1) % TRAIL_HISTORY_LENGTH;
  const writeIndex = trail.historyHead * 3;
  trail.history[writeIndex] = particle.position.x;
  trail.history[writeIndex + 1] = particle.position.y;
  trail.history[writeIndex + 2] = particle.position.z;
  trail.visibleCount = Math.min(TRAIL_HISTORY_LENGTH, trail.visibleCount + 1);
  trail.lastX = particle.position.x;
  trail.lastY = particle.position.y;
  trail.lastZ = particle.position.z;
  trail.dirty = true;
}

function updateParticleTrail(particle) {
  if (!particle?.trail?.mesh) {
    return;
  }

  const trail = particle.trail;
  const speedSq = particle.velocity.lengthSq();
  const speedFactor = THREE.MathUtils.clamp(
    (speedSq - TRAIL_SPEED_VISIBILITY_MIN_SQ) / (TRAIL_SPEED_VISIBILITY_MAX_SQ - TRAIL_SPEED_VISIBILITY_MIN_SQ),
    0,
    1
  );
  const phaseMul = particle.phase === "exhaust" ? 1 : (particle.phase === "intake" ? 0.92 : 0.78);
  const runningMul = simulationRunning ? 1 : TRAIL_SETUP_OPACITY_MUL;
  const trailOpacity = (particle.mesh.material.opacity || 0) * TRAIL_BASE_OPACITY * phaseMul * runningMul * speedFactor;

  if (trailOpacity <= 0.01 || trail.visibleCount < 2) {
    trail.mesh.visible = false;
    trail.mesh.geometry.setDrawRange(0, 0);
    trail.lastOpacity = 0;
    return;
  }

  trail.mesh.visible = true;
  trail.mesh.material.opacity = trailOpacity;

  const opacityChanged = Math.abs(trailOpacity - trail.lastOpacity) > TRAIL_OPACITY_UPDATE_DELTA;
  if (!trail.dirty && !opacityChanged) {
    return;
  }

  const baseColor = getParticleColor(TRAIL_COLOR_TEMP, particle);
  const positions = trail.positionAttr;
  const colors = trail.colorAttr;
  const drawCount = trail.visibleCount;
  const positionsArray = positions.array;
  const colorsArray = colors.array;

  for (let i = 0; i < drawCount; i += 1) {
    const sourceIndex = ((trail.historyHead + i) % TRAIL_HISTORY_LENGTH) * 3;
    const targetIndex = i * 3;
    positionsArray[targetIndex] = trail.history[sourceIndex];
    positionsArray[targetIndex + 1] = trail.history[sourceIndex + 1];
    positionsArray[targetIndex + 2] = trail.history[sourceIndex + 2];

    const fade = 1 - (i / Math.max(drawCount, 1));
    const colorScale = 0.2 + (fade * 0.8);
    colorsArray[targetIndex] = baseColor.r * colorScale;
    colorsArray[targetIndex + 1] = baseColor.g * colorScale;
    colorsArray[targetIndex + 2] = baseColor.b * colorScale;
  }

  trail.mesh.geometry.setDrawRange(0, drawCount);
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  trail.lastOpacity = trailOpacity;
  trail.dirty = false;
}

function applyParticleVisuals(particle) {
  const phaseVisual = PHASE_VISUALS[particle.phase] || PHASE_VISUALS.attic;
  const fadeIn = THREE.MathUtils.clamp(particle.age / SPAWN_FADE_IN_SECONDS, 0, 1);
  const pulse = 0.94 + (Math.sin((particle.age * particle.pulseSpeed) + particle.pulseOffset) * 0.06);

  let exhaustFade = 1;
  if (particle.phase === "exhaust") {
    const fadeDelay = Math.max(0, particle.exhaustFadeDelay || 0);
    const fadeDuration = Math.max(0.001, particle.exhaustFadeDuration || EXHAUST_FADE_OUT_SECONDS);
    const shouldFade = particle.exhaustKind === "ridge"
      ? shouldBeginRidgeFade(particle)
      : particle.exhaustAge >= fadeDelay;
    const fadeProgress = shouldFade
      ? Math.max(0, particle.exhaustAge - fadeDelay) / fadeDuration
      : 0;
    exhaustFade = THREE.MathUtils.clamp(1 - fadeProgress, 0, 1);
  }

  const lifeAlpha = fadeIn * exhaustFade;
  const targetOpacity = particle.baseOpacity * phaseVisual.opacityMul * lifeAlpha;

  particle.mesh.material.opacity = targetOpacity;

  const targetColor = getParticleColor(PARTICLE_COLOR_TEMP, particle);
  particle.mesh.material.color.lerp(targetColor, 0.2);

  const targetScale = particle.baseSize * phaseVisual.scaleMul * pulse;
  particle.mesh.scale.setScalar(targetScale);
}

function getRidgeNearestPoint(vent, fromPosition) {
  const segment = vent.end.clone().sub(vent.start);
  const segmentLengthSq = segment.lengthSq();
  if (segmentLengthSq <= 0.00001) {
    return vent.position.clone();
  }

  const projection = fromPosition.clone().sub(vent.start).dot(segment) / segmentLengthSq;
  const t = THREE.MathUtils.clamp(projection, 0, 1);
  return vent.start.clone().addScaledVector(segment, t);
}

function collectExhaustTargets(ventState, fromPosition) {
  const targets = [];

  for (const vent of ventState.staticVents) {
    const normal = UP.clone().applyQuaternion(vent.orientation).normalize();
    targets.push({
      kind: "static",
      position: vent.position.clone(),
      normal,
      vent
    });
  }

  for (const vent of ventState.ridgeVents) {
    const nearestPoint = getRidgeNearestPoint(vent, fromPosition);
    targets.push({
      kind: "ridge",
      position: nearestPoint,
      normal: new THREE.Vector3(0, 1, 0),
      vent
    });
  }

  return targets;
}

function getNearestExhaustTarget(position, ventState) {
  const targets = collectExhaustTargets(ventState, position);
  if (!targets.length) {
    return null;
  }

  let nearest = targets[0];
  let nearestDistanceSq = position.distanceToSquared(nearest.position);

  for (let i = 1; i < targets.length; i += 1) {
    const current = targets[i];
    const distanceSq = position.distanceToSquared(current.position);
    if (distanceSq < nearestDistanceSq) {
      nearest = current;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearest;
}

function getRandomPointOnStaticVent(target) {
  const vent = target.vent;
  const ventSize = vent.openingSizeFeet || STATIC_VENT_SIZE_FEET;
  const halfSize = (ventSize * 0.5) * 0.92;

  const axisA = new THREE.Vector3(1, 0, 0).applyQuaternion(vent.orientation).normalize();
  const axisB = new THREE.Vector3(0, 0, 1).applyQuaternion(vent.orientation).normalize();

  const offsetA = (Math.random() + Math.random() - 1) * halfSize;
  const offsetB = (Math.random() + Math.random() - 1) * halfSize;

  return vent.position.clone()
    .addScaledVector(axisA, offsetA)
    .addScaledVector(axisB, offsetB)
    .addScaledVector(target.normal, 0.01);
}

function getRandomPointOnRidgeVent(target) {
  const vent = target.vent;
  const segment = vent.end.clone().sub(vent.start);
  const segmentLength = segment.length();
  if (segmentLength <= 0.00001) {
    return vent.position.clone().addScaledVector(target.normal, 0.01);
  }

  const segmentDirection = segment.clone().divideScalar(segmentLength);
  let sideAxis = new THREE.Vector3().crossVectors(UP, segmentDirection).normalize();
  if (!Number.isFinite(sideAxis.x) || !Number.isFinite(sideAxis.y) || !Number.isFinite(sideAxis.z) || sideAxis.lengthSq() <= 0.00001) {
    sideAxis = new THREE.Vector3(1, 0, 0);
  }

  const t = THREE.MathUtils.lerp(0.02, 0.98, Math.random());
  const ridgeWidth = vent.width || RIDGE_VENT_WIDTH_FEET;
  const halfWidth = (ridgeWidth * 0.5) * 0.9;
  const sideOffset = (Math.random() + Math.random() - 1) * halfWidth;

  return vent.start.clone()
    .addScaledVector(segment, t)
    .addScaledVector(sideAxis, sideOffset)
    .addScaledVector(target.normal, 0.01);
}

function getRandomExhaustExitPoint(target) {
  if (!target || !target.vent) {
    return null;
  }

  if (target.kind === "static") {
    return getRandomPointOnStaticVent(target);
  }

  if (target.kind === "ridge") {
    return getRandomPointOnRidgeVent(target);
  }

  return target.position.clone();
}

function getStaticExhaustSpreadDirection(target) {
  const vent = target.vent;
  const tangentA = new THREE.Vector3(1, 0, 0).applyQuaternion(vent.orientation).normalize();
  const tangentB = new THREE.Vector3(0, 0, 1).applyQuaternion(vent.orientation).normalize();
  const sideA = THREE.MathUtils.lerp(-1, 1, Math.random());
  const sideB = THREE.MathUtils.lerp(-1, 1, Math.random());

  return tangentA.multiplyScalar(sideA * 0.75).add(tangentB.multiplyScalar(sideB * 0.75)).normalize();
}

function getRidgeExhaustSpreadDirection(target) {
  const vent = target.vent;
  const segment = vent.end.clone().sub(vent.start);
  const segmentLength = segment.length();
  const alongAxis = segmentLength > 0.00001
    ? segment.divideScalar(segmentLength)
    : new THREE.Vector3(0, 0, 1);

  let acrossAxis = new THREE.Vector3().crossVectors(UP, alongAxis).normalize();
  if (!Number.isFinite(acrossAxis.x) || !Number.isFinite(acrossAxis.y) || !Number.isFinite(acrossAxis.z) || acrossAxis.lengthSq() <= 0.00001) {
    acrossAxis = new THREE.Vector3(1, 0, 0);
  }

  const alongScale = THREE.MathUtils.lerp(-0.35, 0.35, Math.random());
  const acrossScale = THREE.MathUtils.lerp(-0.65, 0.65, Math.random());
  return alongAxis.multiplyScalar(alongScale).add(acrossAxis.multiplyScalar(acrossScale)).normalize();
}

function getExhaustSpreadForTarget(target) {
  if (!target || !target.vent) {
    return { direction: new THREE.Vector3(0, 0, 0), strength: 0 };
  }

  if (target.kind === "static") {
    return {
      direction: getStaticExhaustSpreadDirection(target),
      strength: THREE.MathUtils.lerp(0.18, 0.32, Math.random())
    };
  }

  if (target.kind === "ridge") {
    return {
      direction: getRidgeExhaustSpreadDirection(target),
      strength: THREE.MathUtils.lerp(0.14, 0.28, Math.random())
    };
  }

  return { direction: new THREE.Vector3(0, 0, 0), strength: 0 };
}

function getRidgeFlowAxes(vent) {
  const segment = vent.end.clone().sub(vent.start);
  const segmentLength = segment.length();
  const alongAxis = segmentLength > 0.00001
    ? segment.divideScalar(segmentLength)
    : new THREE.Vector3(0, 0, 1);

  let acrossAxis = new THREE.Vector3().crossVectors(UP, alongAxis).normalize();
  if (!Number.isFinite(acrossAxis.x) || !Number.isFinite(acrossAxis.y) || !Number.isFinite(acrossAxis.z) || acrossAxis.lengthSq() <= 0.00001) {
    acrossAxis = new THREE.Vector3(1, 0, 0);
  }

  return { alongAxis, acrossAxis };
}

function applyRidgeDeflection(particle, target) {
  if (!target?.vent) {
    return null;
  }

  const { alongAxis, acrossAxis } = getRidgeFlowAxes(target.vent);
  const fromRidge = particle.position.clone().sub(target.position);
  const sideDot = fromRidge.dot(acrossAxis);
  let sideSign = sideDot >= 0 ? 1 : -1;
  if (Math.abs(sideDot) < 0.02) {
    sideSign = Math.random() > 0.5 ? 1 : -1;
  }

  const outward = acrossAxis.clone().multiplyScalar(sideSign);
  const slopeDirection = outward.clone().multiplyScalar(0.96).add(UP.clone().multiplyScalar(0.24)).normalize();
  const ridgeZoneInfluence = 1 - THREE.MathUtils.clamp(Math.abs(sideDot) / 0.9, 0, 1);

  return {
    sideSign,
    outward,
    slopeDirection,
    alongAxis,
    ridgeZoneInfluence
  };
}

function applyRidgeApproachLift(desired, particle, nearestTarget, distance, flowProfile) {
  if (nearestTarget?.kind !== "ridge") {
    return;
  }

  const approachRange = 1.6;
  const approach = 1 - THREE.MathUtils.clamp(distance / approachRange, 0, 1);
  if (approach <= 0.0001) {
    return;
  }

  const toRidge = nearestTarget.position.clone().sub(particle.position);
  const horizontalTowardRidge = toRidge.setY(0);
  if (horizontalTowardRidge.lengthSq() > 0.00001) {
    horizontalTowardRidge.normalize();
  }

  desired.add(new THREE.Vector3(0, (0.14 + (flowProfile.directionalStrength * 0.24)) * approach, 0));
  desired.add(horizontalTowardRidge.multiplyScalar((0.06 + (flowProfile.exhaustPullStrength * 0.08)) * approach));
}

function getRidgeExitDistanceSq(particle) {
  if (!particle?.exitPoint) {
    return 0;
  }

  return particle.position.distanceToSquared(particle.exitPoint);
}

function shouldBeginRidgeFade(particle) {
  if (particle.exhaustKind !== "ridge") {
    return true;
  }

  const fadeDelay = Math.max(0, particle.exhaustFadeDelay || 0);
  const fadeDistance = particle.ridgeFadeStartDistance || 0.8;
  const traveledFarEnough = getRidgeExitDistanceSq(particle) >= (fadeDistance * fadeDistance);
  return particle.exhaustAge >= fadeDelay && traveledFarEnough;
}

function updateExitedRidgeParticle(particle, pull, spreadVector) {
  const ageProgress = THREE.MathUtils.clamp(particle.exhaustAge / 6.2, 0, 1);
  const peelProgress = THREE.MathUtils.clamp((particle.exhaustAge - 0.16) / 1.75, 0, 1);
  const incomingCarry = TEMP_VEC_1
    .copy(particle.ridgeIncomingVelocity)
    .multiplyScalar(THREE.MathUtils.lerp(0.64, 0.18, peelProgress));
  incomingCarry.y = Math.max(0, incomingCarry.y);

  const slopeStrength = THREE.MathUtils.lerp(1.02, 0.54, ageProgress) * THREE.MathUtils.lerp(1.0, 0.7, peelProgress);
  const outwardStrength = (THREE.MathUtils.lerp(0.12, 0.84, peelProgress) * THREE.MathUtils.lerp(1.0, 0.8, ageProgress)) + (pull * 0.12);
  const liftStrength = THREE.MathUtils.lerp(0.32, 0.18, ageProgress);
  const alongStrength = (particle.ridgeExitDrift || 0) * THREE.MathUtils.lerp(0.045, 0.02, ageProgress);

  const ridgeTarget = TEMP_VEC_2
    .copy(particle.ridgeSlopeDirection)
    .multiplyScalar(slopeStrength)
    .addScaledVector(particle.ridgeOutwardDirection, outwardStrength)
    .addScaledVector(particle.ridgeAlongDirection, alongStrength)
    .addScaledVector(spreadVector, 0.24);
  ridgeTarget.y += liftStrength;

  return TEMP_VEC_3
    .copy(incomingCarry)
    .addScaledVector(ridgeTarget, THREE.MathUtils.lerp(0.55, 1.0, peelProgress));
}

function getAtticBounds() {
  const geometry = getGeometryStateRef();
  const params = geometry.currentGeometryParams || {};

  const buildingWidth = params.buildingWidth || 30;
  const buildingLength = params.buildingLength || 50;
  const halfWidth = buildingWidth / 2;
  const halfLength = buildingLength / 2;
  const atticHeight = geometry.atticHeight || 1;
  const roofType = params.roofType;
  let validatedRoofType;
  try {
    validatedRoofType = roofType ? validateRoofType(roofType) : null;
  } catch (error) {
    console.error("[RoofFlo Airflow]", error.message);
    validatedRoofType = null;
  }

  return { halfWidth, halfLength, atticHeight, roofType: validatedRoofType };
}

function getAirflowRoofType() {
  if (!getGeometryStateRef) {
    console.error(
      "[RoofFlo Airflow] Geometry state reference not available. " +
      "Airflow simulation cannot proceed."
    );
    return null;
  }

  const geometry = getGeometryStateRef();
  const roofType = geometry?.currentGeometryParams?.roofType;
  
  if (!roofType) {
    console.error(
      "[RoofFlo Airflow] Roof type not found in geometry state. " +
      "Geometry may not be initialized. Airflow cannot proceed."
    );
    return null;
  }
  
  try {
    return validateRoofType(roofType);
  } catch (error) {
    console.error("[RoofFlo Airflow]", error.message);
    return null;
  }
}

function getIntakeInwardDirection(source) {
  const roofType = getAirflowRoofType();
  
  if (roofType === null) {
    console.error(
      "[RoofFlo Airflow] Cannot determine intake direction: roof type is invalid. " +
      "Defaulting to left side direction."
    );
    return 1;
  }
  
  if (roofType === "shed") {
    return 1;
  }

  return source?.side === "left" ? 1 : -1;
}

function getVentilationMode(ventState) {
  const intakeCount = (ventState.intakeVents || []).length;
  const staticCount = (ventState.staticVents || []).length;
  const ridgeCount = (ventState.ridgeVents || []).length;
  const hasIntake = intakeCount > 0;
  const hasExhaust = (staticCount + ridgeCount) > 0;

  if (!hasIntake && !hasExhaust) {
    return VentilationMode.NONE;
  }

  if (!hasIntake && hasExhaust) {
    return VentilationMode.EXHAUST_ONLY;
  }

  if (hasIntake && !hasExhaust) {
    return VentilationMode.INTAKE_ONLY;
  }

  return VentilationMode.BALANCED;
}

function getVentilationRuleFromGeometry() {
  if (!getGeometryStateRef) {
    return "1/150";
  }

  const geometry = getGeometryStateRef();
  const rule = geometry?.currentGeometryParams?.ventilationRule;
  return rule === "1/300" ? "1/300" : "1/150";
}

function getVentilationFlowProfile(bounds, ventState, mode) {
  const intakeCount = (ventState.intakeVents || []).length;
  const staticCount = (ventState.staticVents || []).length;
  const ridgeLengthFeet = (ventState.ridgeVents || []).reduce((sum, vent) => sum + (vent.length || 0), 0);

  const atticAreaSqFt = calculateAtticArea(bounds.halfWidth * 2, bounds.halfLength * 2);
  const ventilationRule = getVentilationRuleFromGeometry();
  const requiredTotalIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
  const requiredIntakeIn2 = calculateRequiredIntake(requiredTotalIn2);
  const requiredExhaustIn2 = calculateRequiredExhaust(requiredTotalIn2);

  const installed = calculateInstalledVentilation({
    intakeCount,
    staticCount,
    ridgeLengthFeet
  });

  const intakeRatio = requiredIntakeIn2 > 0
    ? THREE.MathUtils.clamp(installed.installedIntakeIn2 / requiredIntakeIn2, 0, 1.5)
    : 0;
  const exhaustRatio = requiredExhaustIn2 > 0
    ? THREE.MathUtils.clamp(installed.installedExhaustIn2 / requiredExhaustIn2, 0, 1.5)
    : 0;

  const hasIntake = intakeCount > 0;
  const hasExhaust = (staticCount + (ventState.ridgeVents || []).length) > 0;
  const minCoverage = Math.min(intakeRatio, exhaustRatio);
  const ratioGap = Math.abs(intakeRatio - exhaustRatio);
  const ratioDenominator = Math.max(intakeRatio, exhaustRatio, 1);
  const pairBalance = 1 - THREE.MathUtils.clamp(ratioGap / ratioDenominator, 0, 1);

  let quality = 0.04;
  if (mode === VentilationMode.BALANCED) {
    quality = THREE.MathUtils.clamp((minCoverage * 0.72) + (pairBalance * 0.28), 0.08, 1);
  } else if (mode === VentilationMode.INTAKE_ONLY) {
    quality = THREE.MathUtils.clamp(intakeRatio * 0.3, 0.06, 0.36);
  } else if (mode === VentilationMode.EXHAUST_ONLY) {
    quality = THREE.MathUtils.clamp(exhaustRatio * 0.3, 0.06, 0.34);
  }

  const directionalStrength = THREE.MathUtils.clamp(0.15 + (quality * 0.9), 0.1, 1);
  const intakeDrive = hasIntake ? THREE.MathUtils.clamp(0.2 + (quality * 0.9), 0.12, 1.05) : 0.02;
  const exhaustPullStrength = hasExhaust ? THREE.MathUtils.clamp(0.15 + (quality * 1.0), 0.1, 1.15) : 0.02;
  const chaosStrength = THREE.MathUtils.clamp(0.22 + ((1 - quality) * 0.7), 0.2, 0.95);
  const stagnationStrength = THREE.MathUtils.clamp(0.2 + ((1 - quality) * 0.85), 0.18, 1);
  const exhaustCaptureRadius = THREE.MathUtils.lerp(0.24, 0.45, THREE.MathUtils.clamp(exhaustPullStrength, 0, 1));

  return {
    mode,
    quality,
    intakeRatio,
    exhaustRatio,
    directionalStrength,
    intakeDrive,
    exhaustPullStrength,
    chaosStrength,
    stagnationStrength,
    exhaustCaptureRadius
  };
}

function getNearestIntakeVent(position, ventState) {
  const intakeVents = ventState.intakeVents || [];
  if (!intakeVents.length) {
    return null;
  }

  let nearestVent = intakeVents[0];
  let nearestDistanceSq = position.distanceToSquared(nearestVent.position);

  for (let i = 1; i < intakeVents.length; i += 1) {
    const candidate = intakeVents[i];
    const distanceSq = position.distanceToSquared(candidate.position);
    if (distanceSq < nearestDistanceSq) {
      nearestVent = candidate;
      nearestDistanceSq = distanceSq;
    }
  }

  return {
    vent: nearestVent,
    distanceSq: nearestDistanceSq
  };
}

function applyDirectionalBias(particle, bounds, nearestTarget, flowProfile) {
  const heightRatio = THREE.MathUtils.clamp(particle.position.y / Math.max(bounds.atticHeight, 0.001), 0, 1);
  const riseStrength = THREE.MathUtils.lerp(0.08, 0.4, flowProfile.directionalStrength) * (0.86 + ((1 - heightRatio) * 0.28));
  const desiredBias = new THREE.Vector3(0, riseStrength, 0);

  if (nearestTarget) {
    const toTarget = nearestTarget.position.clone().sub(particle.position);
    const distance = toTarget.length();
    if (distance > 0.0001) {
      const distanceFactor = 1 - THREE.MathUtils.clamp(distance / Math.max(bounds.halfLength, 1), 0, 1);
      const lateralPull = (0.12 + (distanceFactor * 0.55)) * flowProfile.directionalStrength;
      desiredBias.add(toTarget.normalize().multiplyScalar(lateralPull));
    }
  }

  return desiredBias;
}

function applyIntakeInfluence(particle, desired, deltaTime, ventState, flowProfile) {
  const nearestIntake = getNearestIntakeVent(particle.position, ventState);
  if (!nearestIntake) {
    return { nearestIntake, intakeInfluence: 0 };
  }

  const influenceRadiusSq = 2.4 * 2.4;
  const intakeInfluence = 1 - THREE.MathUtils.clamp(nearestIntake.distanceSq / influenceRadiusSq, 0, 1);
  if (intakeInfluence <= 0) {
    return { nearestIntake, intakeInfluence: 0 };
  }

  const inwardDirection = getIntakeInwardDirection(nearestIntake.vent);
  const inwardPush = new THREE.Vector3(
    inwardDirection * (0.18 + (flowProfile.intakeDrive * 0.3)),
    0.08 + (flowProfile.intakeDrive * 0.16),
    (Math.random() - 0.5) * (0.08 + (flowProfile.chaosStrength * 0.06))
  );

  desired.addScaledVector(inwardPush, intakeInfluence);

  const energyBoost = 1 + (intakeInfluence * flowProfile.intakeDrive * deltaTime * 0.35);
  particle.velocity.multiplyScalar(THREE.MathUtils.clamp(energyBoost, 1, 1.05));

  return { nearestIntake, intakeInfluence };
}

function applyStagnationInfluence(desired, nearestExhaustDistanceSq, nearestIntake, flowProfile) {
  const intakeInfluence = nearestIntake
    ? 1 - THREE.MathUtils.clamp(nearestIntake.distanceSq / (2.4 * 2.4), 0, 1)
    : 0;
  const exhaustInfluence = Number.isFinite(nearestExhaustDistanceSq)
    ? 1 - THREE.MathUtils.clamp(nearestExhaustDistanceSq / (2.8 * 2.8), 0, 1)
    : 0;

  const localActivity = Math.max(0, intakeInfluence, exhaustInfluence);
  const stagnation = (1 - localActivity) * flowProfile.stagnationStrength;
  if (stagnation <= 0.001) {
    return;
  }

  desired.multiplyScalar(1 - (stagnation * 0.38));
  desired.add(new THREE.Vector3(
    (Math.random() - 0.5) * 0.14 * stagnation,
    (Math.random() - 0.5) * 0.05 * stagnation,
    (Math.random() - 0.5) * 0.14 * stagnation
  ));
}

function transitionParticleToExhaust(particle, nearestTarget, flowProfile, velocityScale = 1) {
  const exitPoint = getRandomExhaustExitPoint(nearestTarget) || nearestTarget.position;
  const spread = getExhaustSpreadForTarget(nearestTarget);
  const pullStrength = THREE.MathUtils.clamp(flowProfile.exhaustPullStrength, 0.12, 1.2);

  particle.phase = "exhaust";
  particle.exhaustAge = 0;
  particle.exitPoint = exitPoint.clone();
  particle.exhaustSpreadDirection.copy(spread.direction);
  particle.exhaustSpreadStrength = spread.strength * pullStrength;
  particle.exhaustPullStrength = pullStrength;
  particle.exhaustKind = nearestTarget.kind || "static";
  particle.exhaustFadeDelay = 0;
  particle.exhaustFadeDuration = EXHAUST_FADE_OUT_SECONDS;
  particle.exhaustMinTravelTime = 0.2;
  particle.exhaustRemovalDistance = THREE.MathUtils.lerp(0.55, 1.05, THREE.MathUtils.clamp(pullStrength, 0, 1));
  particle.ridgeOutwardDirection.set(0, 0, 0);
  particle.ridgeSlopeDirection.set(0, 0, 0);
  particle.ridgeAlongDirection.set(0, 0, 0);
  particle.ridgeIncomingVelocity.set(0, 0, 0);
  particle.ridgeFadeStartDistance = 0.8;
  particle.ridgeSideSign = 0;
  particle.ridgeExitDrift = 0;
  particle.isExitingRidge = false;

  if (nearestTarget.kind === "ridge") {
    const ridgeDeflection = applyRidgeDeflection(particle, nearestTarget);
    if (ridgeDeflection) {
      particle.ridgeIncomingVelocity.copy(particle.velocity);
      particle.ridgeOutwardDirection.copy(ridgeDeflection.outward);
      particle.ridgeSlopeDirection.copy(ridgeDeflection.slopeDirection);
      particle.ridgeAlongDirection.copy(ridgeDeflection.alongAxis);
      particle.ridgeSideSign = ridgeDeflection.sideSign;
      particle.ridgeExitDrift = THREE.MathUtils.lerp(-0.35, 0.35, Math.random());
      particle.isExitingRidge = true;
      particle.ridgeExitAge = 0;
      particle.ridgeExitProgress = 0;

      particle.exhaustFadeDelay =
        THREE.MathUtils.lerp(1.7, 2.55, ridgeDeflection.ridgeZoneInfluence) +
        RIDGE_EXIT_EXTRA_FADE_DELAY;

      particle.exhaustFadeDuration =
        EXHAUST_FADE_OUT_SECONDS * THREE.MathUtils.lerp(2.7, 3.35, ridgeDeflection.ridgeZoneInfluence);

      particle.exhaustMinTravelTime = 1.8;

      particle.exhaustRemovalDistance *=
        THREE.MathUtils.lerp(2.2, 2.95, ridgeDeflection.ridgeZoneInfluence) +
        RIDGE_EXIT_EXTRA_REMOVAL_DISTANCE;

      particle.ridgeFadeStartDistance = THREE.MathUtils.lerp(1.2, 1.75, ridgeDeflection.ridgeZoneInfluence);

      const ridgeBlendVelocity = particle.ridgeIncomingVelocity
        .clone()
        .multiplyScalar(0.82)
        .add(
          ridgeDeflection.slopeDirection
            .clone()
            .multiplyScalar((0.34 + (pullStrength * 0.08)) * velocityScale)
        )
        .add(
          ridgeDeflection.outward
            .clone()
            .multiplyScalar((0.025 + (pullStrength * 0.025)) * velocityScale)
        )
        .add(new THREE.Vector3(0, 0.16, 0))
        .add(
          ridgeDeflection.alongAxis
            .clone()
            .multiplyScalar((Math.random() - 0.5) * 0.018)
        );

      particle.velocity.copy(ridgeBlendVelocity);
    }
  } else {
    particle.velocity.copy(
      nearestTarget.normal
        .clone()
        .multiplyScalar((0.48 + (pullStrength * 0.44)) * velocityScale)
        .add(new THREE.Vector3(0, (0.2 + (pullStrength * 0.28)) * velocityScale, 0))
    );
  }

  if (particle.velocity.lengthSq() <= 0.00001) {
    particle.velocity.copy(new THREE.Vector3(0, 0.35, 0));
  }
  particle.position.copy(exitPoint);
}

function getRandomPointInsideAttic(bounds) {
  const xPadding = 0.3;
  const zPadding = 0.3;
  const x = THREE.MathUtils.lerp(-bounds.halfWidth + xPadding, bounds.halfWidth - xPadding, Math.random());
  const z = THREE.MathUtils.lerp(-bounds.halfLength + zPadding, bounds.halfLength - zPadding, Math.random());
  const roofLimit = getRoofLimitY(x, bounds.halfWidth, bounds.atticHeight, bounds.roofType);
  const maxY = Math.max(0.2, roofLimit - 0.08);
  const y = THREE.MathUtils.lerp(0.06, maxY, Math.random());
  return new THREE.Vector3(x, y, z);
}

function createTrappedParticle(position) {
  const mesh = createParticleMesh(position);
  airflowGroup.add(mesh);
  const trail = createParticleTrail(position);

  particles.push({
    mesh,
    trail,
    position: position.clone(),
    velocity: new THREE.Vector3(
      THREE.MathUtils.lerp(-TRAPPED_BASE_DRIFT_SPEED, TRAPPED_BASE_DRIFT_SPEED, Math.random()),
      THREE.MathUtils.lerp(0.01, TRAPPED_UPWARD_BIAS, Math.random()),
      THREE.MathUtils.lerp(-TRAPPED_BASE_DRIFT_SPEED, TRAPPED_BASE_DRIFT_SPEED, Math.random())
    ),
    age: 0,
    maxAge: PARTICLE_MAX_AGE_SECONDS,
    phase: "attic",
    type: "stale",
    freshness: 0,
    freshAge: 0,
    side: "center",
    targetExhaust: null,
    exitPoint: null,
    exhaustSpreadDirection: new THREE.Vector3(0, 0, 0),
    exhaustSpreadStrength: 0,
    exhaustPullStrength: 0,
    exhaustRemovalDistance: 0.8,
    exhaustKind: "static",
    exhaustFadeDelay: 0,
    exhaustFadeDuration: EXHAUST_FADE_OUT_SECONDS,
    exhaustMinTravelTime: 0.2,
    isExitingRidge: false,
    ridgeSideSign: 0,
    ridgeOutwardDirection: new THREE.Vector3(0, 0, 0),
    ridgeSlopeDirection: new THREE.Vector3(0, 0, 0),
    ridgeAlongDirection: new THREE.Vector3(0, 0, 0),
    ridgeIncomingVelocity: new THREE.Vector3(0, 0, 0),
    ridgeFadeStartDistance: 0.8,
    ridgeExitDrift: 0,
    exhaustAge: 0,
    baseOpacity: PARTICLE_OPACITY * THREE.MathUtils.lerp(0.7, 1.05, Math.random()),
    baseSize: PARTICLE_SIZE * THREE.MathUtils.lerp(0.9, 1.18, Math.random()),
    pulseSpeed: THREE.MathUtils.lerp(1.0, 2.2, Math.random()),
    pulseOffset: Math.random() * Math.PI * 2,
    lateralBias: new THREE.Vector3(
      THREE.MathUtils.lerp(-0.22, 0.22, Math.random()),
      THREE.MathUtils.lerp(-0.03, 0.05, Math.random()),
      THREE.MathUtils.lerp(-0.28, 0.28, Math.random())
    ),
    driftSeed: Math.random()
  });
}

function seedInitialTrappedAir() {
  if (!airflowGroup || !getGeometryStateRef || particles.length > 0) {
    return;
  }

  const bounds = getAtticBounds();
  const targetCount = getBaseStaleTargetCount(bounds);

  for (let i = 0; i < targetCount && particles.length < MAX_TOTAL_PARTICLES; i += 1) {
    createTrappedParticle(getRandomPointInsideAttic(bounds));
  }
}

function getBaseStaleTargetCount(bounds) {
  const atticVolumeEstimate = (bounds.halfWidth * 2) * (bounds.halfLength * 2) * Math.max(bounds.atticHeight * 0.5, 1);
  return THREE.MathUtils.clamp(
    Math.floor(atticVolumeEstimate * INITIAL_TRAPPED_PARTICLE_DENSITY),
    MIN_INITIAL_TRAPPED_PARTICLES,
    MAX_INITIAL_TRAPPED_PARTICLES
  );
}

function getStaleDensityFactorForMode(mode) {
  if (mode === VentilationMode.NONE) {
    return 1.0;
  }

  if (mode === VentilationMode.INTAKE_ONLY) {
    return 0.92;
  }

  if (mode === VentilationMode.EXHAUST_ONLY) {
    return 0.82;
  }

  // Balanced can reduce stale reservoir gradually, stronger once active simulation runs.
  return simulationRunning ? 0.18 : 0.45;
}

function countStaleParticles() {
  let staleCount = 0;
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const freshness = particle.freshness ?? (particle.type === "fresh" ? 1 : 0);
    if (particle.type === "stale" || freshness < 0.35) {
      staleCount += 1;
    }
  }
  return staleCount;
}

function getParticleCounts() {
  const counts = {
    stale: 0,
    fresh: 0,
    total: particles.length
  };

  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const freshness = particle.freshness ?? (particle.type === "fresh" ? 1 : 0);
    if (particle.type === "fresh" && freshness >= 0.35) {
      counts.fresh += 1;
    } else {
      counts.stale += 1;
    }
  }

  return counts;
}

function replenishStaleReservoir(deltaTime, bounds, mode) {
  if (!airflowGroup) {
    return;
  }

  const baseTarget = getBaseStaleTargetCount(bounds);
  const modeTarget = Math.floor(baseTarget * getStaleDensityFactorForMode(mode));
  const staleTarget = mode === VentilationMode.BALANCED
    ? modeTarget
    : Math.max(MIN_STALE_PARTICLES, modeTarget);
  let counts = getParticleCounts();
  let staleCount = counts.stale;

  if (staleCount >= staleTarget || counts.total >= MAX_TOTAL_PARTICLES) {
    staleReplenishAccumulator = 0;
    return;
  }

  staleReplenishAccumulator += deltaTime;
  while (
    staleReplenishAccumulator >= STALE_REPLENISH_INTERVAL_SECONDS &&
    particles.length < MAX_TOTAL_PARTICLES &&
    staleCount < staleTarget
  ) {
    staleReplenishAccumulator -= STALE_REPLENISH_INTERVAL_SECONDS;

    const missing = staleTarget - staleCount;
    const spawnCount = Math.min(MAX_STALE_REPLENISH_PER_TICK, Math.max(1, missing));
    for (let i = 0; i < spawnCount && particles.length < MAX_TOTAL_PARTICLES; i += 1) {
      createTrappedParticle(getRandomPointInsideAttic(bounds));
    }

    counts = getParticleCounts();
    staleCount = counts.stale;
  }
}

function enforceParticlePopulationLimit() {
  while (particles.length > MAX_TOTAL_PARTICLES) {
    let oldestIndex = 0;
    let oldestAge = particles[0]?.age ?? -1;

    for (let i = 1; i < particles.length; i += 1) {
      const age = particles[i].age ?? 0;
      if (age > oldestAge) {
        oldestAge = age;
        oldestIndex = i;
      }
    }

    disposeParticle(particles[oldestIndex], oldestIndex);
  }
}

function getRoofLimitY(x, halfWidth, atticHeight, roofType) {
  if (!roofType) {
    console.error(
      "[RoofFlo Airflow] getRoofLimitY called without roof type. " +
      "This may cause incorrect particle visualization."
    );
    // Degrade gracefully but error is logged
    return atticHeight;
  }
  
  if (halfWidth <= 0) {
    return atticHeight;
  }

  if (roofType === "shed") {
    const normalized = THREE.MathUtils.clamp((x + halfWidth) / (halfWidth * 2), 0, 1);
    return atticHeight * normalized;
  }

  const normalized = Math.min(1, Math.abs(x) / halfWidth);
  return atticHeight * (1 - normalized);
}

function confineToAttic(particle, bounds) {
  const padding = 0.12;

  particle.position.z = THREE.MathUtils.clamp(
    particle.position.z,
    -bounds.halfLength + padding,
    bounds.halfLength - padding
  );

  particle.position.x = THREE.MathUtils.clamp(
    particle.position.x,
    -bounds.halfWidth + padding,
    bounds.halfWidth - padding
  );

  const roofLimit = getRoofLimitY(particle.position.x, bounds.halfWidth, bounds.atticHeight, bounds.roofType);
  particle.position.y = THREE.MathUtils.clamp(particle.position.y, 0.03, Math.max(0.2, roofLimit - 0.06));
}

function getRandomIntakeSpawnPosition(intakeVent) {
  const startPosition = intakeVent.position.clone();
  const longAxis = (intakeVent.orientation || new THREE.Vector3(0, 0, 1)).clone().normalize();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const shortAxis = new THREE.Vector3().crossVectors(upAxis, longAxis).normalize();

  const ventLength = intakeVent.length || 1.5;
  const ventWidth = intakeVent.width || 0.45;
  const longRange = (ventLength * 0.5) * 0.92;
  const shortRange = (ventWidth * 0.5) * 0.78;

  // Triangular distribution keeps a mild center bias while still covering the full footprint.
  const longOffset = (Math.random() + Math.random() - 1) * longRange;
  const shortOffset = (Math.random() + Math.random() - 1) * shortRange;

  startPosition.addScaledVector(longAxis, longOffset);
  if (Number.isFinite(shortAxis.x) && Number.isFinite(shortAxis.y) && Number.isFinite(shortAxis.z)) {
    startPosition.addScaledVector(shortAxis, shortOffset);
  }

  return startPosition;
}

function createParticleFromIntakeVent(intakeVent) {
  const inwardDirection = getIntakeInwardDirection(intakeVent);
  const startPosition = getRandomIntakeSpawnPosition(intakeVent);
  startPosition.x += inwardDirection * 0.16;
  startPosition.y += 0.04;

  const mesh = createParticleMesh(startPosition);
  airflowGroup.add(mesh);
  const trail = createParticleTrail(startPosition);

  particles.push({
    mesh,
    trail,
    position: startPosition.clone(),
    velocity: new THREE.Vector3(
      inwardDirection * 0.68,
      0.24,
      (Math.random() - 0.5) * 0.26
    ),
    age: 0,
    maxAge: PARTICLE_MAX_AGE_SECONDS,
    phase: "intake",
    type: "fresh",
    freshness: 1,
    freshAge: 0,
    side: intakeVent.side,
    targetExhaust: null,
      exitPoint: null,
      exhaustSpreadDirection: new THREE.Vector3(0, 0, 0),
      exhaustSpreadStrength: 0,
      exhaustPullStrength: 0,
      exhaustRemovalDistance: 0.8,
      exhaustKind: "static",
      exhaustFadeDelay: 0,
      exhaustFadeDuration: EXHAUST_FADE_OUT_SECONDS,
      exhaustMinTravelTime: 0.2,
      isExitingRidge: false,
      ridgeSideSign: 0,
      ridgeOutwardDirection: new THREE.Vector3(0, 0, 0),
      ridgeSlopeDirection: new THREE.Vector3(0, 0, 0),
      ridgeAlongDirection: new THREE.Vector3(0, 0, 0),
      ridgeIncomingVelocity: new THREE.Vector3(0, 0, 0),
      ridgeFadeStartDistance: 0.8,
      ridgeExitDrift: 0,
      exhaustAge: 0,
      baseOpacity: PARTICLE_OPACITY * THREE.MathUtils.lerp(0.92, 1.08, Math.random()),
      baseSize: PARTICLE_SIZE * THREE.MathUtils.lerp(0.92, 1.24, Math.random()),
      pulseSpeed: THREE.MathUtils.lerp(1.6, 2.8, Math.random()),
      pulseOffset: Math.random() * Math.PI * 2,
      lateralBias: new THREE.Vector3(
        THREE.MathUtils.lerp(-0.34, 0.34, Math.random()),
        THREE.MathUtils.lerp(-0.04, 0.08, Math.random()),
        THREE.MathUtils.lerp(-0.48, 0.48, Math.random())
      ),
      driftSeed: Math.random()
  });
}

function spawnFreshAirFromIntakes(deltaTime, ventState) {
  const intakeVents = ventState.intakeVents || [];
  if (!intakeVents.length || particles.length >= MAX_TOTAL_PARTICLES) {
    return;
  }

  const interval = simulationRunning
    ? ACTIVE_MODE_FRESH_SPAWN_INTERVAL_SECONDS
    : EDIT_MODE_FRESH_SPAWN_INTERVAL_SECONDS;

  editFreshSpawnAccumulator += deltaTime;
  while (editFreshSpawnAccumulator >= interval && particles.length < MAX_TOTAL_PARTICLES) {
    editFreshSpawnAccumulator -= interval;
    const spawnCountPerTick = simulationRunning ? 2 : 1;
    for (let i = 0; i < spawnCountPerTick; i += 1) {
      for (const intakeVent of intakeVents) {
        if (particles.length >= MAX_TOTAL_PARTICLES) {
          break;
        }
        createParticleFromIntakeVent(intakeVent);
      }
    }
  }
}

function spawnParticles(deltaTime) {
  if (!simulationRunning) {
    return;
  }

  const ventState = getVentsRef();
  const mode = getVentilationMode(ventState);

  // No intake vents means no fresh-air sources.
  if (mode === VentilationMode.NONE || mode === VentilationMode.EXHAUST_ONLY) {
    return;
  }

  // In edit mode this is subtle; in active mode it's stronger.
  spawnFreshAirFromIntakes(deltaTime, ventState);
}

function updateSetupModeParticle(particle, deltaTime, bounds) {
  // Setup mode is stale-only ambient attic drift.
  particle.phase = "attic";
  particle.type = "stale";
  particle.freshness = 0;

  const setupDrift = new THREE.Vector3(
    (Math.random() - 0.5) * 0.08,
    (Math.random() - 0.5) * 0.03 + (TRAPPED_UPWARD_BIAS * 0.4),
    (Math.random() - 0.5) * 0.08
  );

  const circulation = new THREE.Vector3(
    Math.sin((particle.age * 0.4) + particle.driftSeed * 5) * 0.03,
    0,
    Math.cos((particle.age * 0.35) + particle.driftSeed * 6) * 0.04
  );

  const desired = setupDrift.add(circulation);
  particle.velocity.lerp(desired, 0.05);
  particle.position.addScaledVector(particle.velocity, deltaTime);
  confineToAttic(particle, bounds);
}

function updateIntakePhase(particle, deltaTime, bounds, ventState, flowProfile) {
  const inwardDirection = getIntakeInwardDirection(particle);
  const inwardStrength = (simulationRunning ? 0.95 : 0.42) * (0.7 + (flowProfile.intakeDrive * 0.4));
  const upwardStrength = (simulationRunning ? 0.34 : 0.16) * (0.75 + (flowProfile.directionalStrength * 0.35));
  const lateralStrength = (simulationRunning ? 0.1 : 0.24) * (0.9 + (flowProfile.chaosStrength * 0.25));

  const desired = new THREE.Vector3(
    inwardDirection * inwardStrength,
    upwardStrength,
    (Math.random() - 0.5) * lateralStrength
  );

  applyIntakeInfluence(particle, desired, deltaTime, ventState, flowProfile);

  particle.velocity.lerp(desired, 0.16);
  particle.position.addScaledVector(particle.velocity, deltaTime);

  if (particle.type === "fresh") {
    particle.freshAge += deltaTime;
    particle.freshness = Math.min(1, (particle.freshness ?? 1) + (deltaTime * 0.2));
  }

  const nearAtticEdge = bounds.roofType === "shed"
    ? particle.position.x >= -bounds.halfWidth + 0.18
    : (particle.side === "left"
      ? particle.position.x >= -bounds.halfWidth + 0.18
      : particle.position.x <= bounds.halfWidth - 0.18);
  if (nearAtticEdge) {
    particle.phase = "attic";
    particle.targetExhaust = null;
  }

  particle.position.z = THREE.MathUtils.clamp(
    particle.position.z,
    -bounds.halfLength + 0.08,
    bounds.halfLength - 0.08
  );
  particle.position.y = Math.max(0.02, particle.position.y);
}

function decayFreshnessInTrappedAir(particle, deltaTime, durationSeconds) {
  if (particle.type !== "fresh") {
    return;
  }

  particle.freshAge += deltaTime;
  const decayRate = durationSeconds > 0 ? (1 / durationSeconds) : 1;
  particle.freshness = Math.max(0, (particle.freshness ?? 1) - (decayRate * deltaTime));

  if (particle.freshness <= 0.01) {
    particle.type = "stale";
    particle.freshness = 0;
  }
}

function updateAtticPhase(particle, deltaTime, bounds, ventState, flowProfile) {
  const heightRatio = THREE.MathUtils.clamp(particle.position.y / Math.max(bounds.atticHeight, 0.001), 0, 1);
  const centerRatio = 1 - THREE.MathUtils.clamp(Math.abs(particle.position.x) / Math.max(bounds.halfWidth, 0.001), 0, 1);
  const centerBias = new THREE.Vector3(
    -particle.position.x * 0.11,
    0.34,
    -particle.position.z * 0.004
  );

  const lateralSpread = particle.lateralBias.clone().multiplyScalar(0.24 + ((1 - heightRatio) * 0.36));
  const circulation = new THREE.Vector3(
    Math.sin((particle.age * 0.9) + particle.driftSeed * 6) * 0.08,
    0,
    Math.cos((particle.age * 0.7) + particle.driftSeed * 5) * 0.12
  );
  const turbulence = new THREE.Vector3(
    (Math.random() - 0.5) * (0.06 + (flowProfile.chaosStrength * 0.08)),
    (Math.random() - 0.5) * (0.03 + (flowProfile.chaosStrength * 0.04)),
    (Math.random() - 0.5) * (0.08 + (flowProfile.chaosStrength * 0.12))
  );

  let desired = centerBias.add(lateralSpread).add(circulation).add(turbulence);
  const nearestTarget = getNearestExhaustTarget(particle.position, ventState);
  const directionalBias = applyDirectionalBias(particle, bounds, nearestTarget, flowProfile);
  desired.add(directionalBias);
  const intakeInfluenceData = applyIntakeInfluence(particle, desired, deltaTime, ventState, flowProfile);

  if (nearestTarget) {
    const toTarget = nearestTarget.position.clone().sub(particle.position);
    const distance = toTarget.length();
    if (distance > 0.0001) {
      const distanceFactor = 1 - THREE.MathUtils.clamp(distance / Math.max(bounds.halfLength, 1), 0, 1);
      const targetStrength = (0.16 + (heightRatio * 0.4) + (centerRatio * 0.08) + (distanceFactor * 0.45))
        * flowProfile.exhaustPullStrength
        * BALANCED_DIRECTIONAL_BOOST;
      toTarget.normalize().multiplyScalar(targetStrength);
      desired.add(toTarget);
    }

    applyRidgeApproachLift(desired, particle, nearestTarget, distance, flowProfile);

    particle.targetExhaust = nearestTarget;
    if (distance < flowProfile.exhaustCaptureRadius) {
      transitionParticleToExhaust(particle, nearestTarget, flowProfile, 1);
    }
  } else {
    particle.targetExhaust = null;
  }

  const nearestExhaustDistanceSq = nearestTarget
    ? particle.position.distanceToSquared(nearestTarget.position)
    : Infinity;
  applyStagnationInfluence(desired, nearestExhaustDistanceSq, intakeInfluenceData.nearestIntake, flowProfile);

  particle.velocity.lerp(desired, 0.08);
  particle.position.addScaledVector(particle.velocity, deltaTime);
  confineToAttic(particle, bounds);
}

function updateTrappedPhase(particle, deltaTime, bounds, ventState, mode, flowProfile) {
  const driftNoise = new THREE.Vector3(
    (Math.random() - 0.5) * (0.08 + (flowProfile.chaosStrength * 0.09)),
    (Math.random() - 0.5) * (0.03 + (flowProfile.chaosStrength * 0.04)),
    (Math.random() - 0.5) * (0.08 + (flowProfile.chaosStrength * 0.1))
  );

  const circulation = new THREE.Vector3(
    Math.sin((particle.age * 0.6) + particle.driftSeed * 5) * 0.05,
    0,
    Math.cos((particle.age * 0.5) + particle.driftSeed * 6) * 0.06
  );

  const trappedDesired = particle.lateralBias
    .clone()
    .multiplyScalar(0.08)
    .add(circulation)
    .add(driftNoise)
    .add(new THREE.Vector3(0, TRAPPED_UPWARD_BIAS * (0.75 + (flowProfile.directionalStrength * 0.38)), 0));

  const nearestTarget = getNearestExhaustTarget(particle.position, ventState);
  trappedDesired.add(applyDirectionalBias(particle, bounds, nearestTarget, flowProfile));
  const intakeInfluenceData = applyIntakeInfluence(particle, trappedDesired, deltaTime, ventState, flowProfile);

  if (mode === VentilationMode.EXHAUST_ONLY) {
    if (nearestTarget) {
      const toTarget = nearestTarget.position.clone().sub(particle.position);
      const distance = toTarget.length();
      if (distance > 0.0001) {
        toTarget.normalize().multiplyScalar(WEAK_ESCAPE_STRENGTH * flowProfile.exhaustPullStrength);
        trappedDesired.add(toTarget);
      }

      if (distance < Math.max(0.28, flowProfile.exhaustCaptureRadius * 0.92)) {
        transitionParticleToExhaust(particle, nearestTarget, flowProfile, 0.78);
      }
    }
  }

  // Intake-only remains largely trapped with slight stirring near eaves.
  if (mode === VentilationMode.INTAKE_ONLY) {
    const eaveBias = new THREE.Vector3(
      -particle.position.x * 0.025,
      0,
      Math.sin((particle.age * 0.45) + particle.driftSeed * 4) * 0.03
    );
    trappedDesired.add(eaveBias);

    // Intake-only demo: fresh air enters, mixes, then becomes stale without an exhaust path.
    decayFreshnessInTrappedAir(particle, deltaTime, INTAKE_ONLY_FRESH_TO_STALE_SECONDS);
  } else {
    // In other trapped modes, fresh pockets also fade, generally faster.
    decayFreshnessInTrappedAir(particle, deltaTime, GENERAL_TRAPPED_FRESH_TO_STALE_SECONDS);
  }

  const nearestExhaustDistanceSq = nearestTarget
    ? particle.position.distanceToSquared(nearestTarget.position)
    : Infinity;
  applyStagnationInfluence(trappedDesired, nearestExhaustDistanceSq, intakeInfluenceData.nearestIntake, flowProfile);

  particle.velocity.lerp(trappedDesired, 0.06);
  particle.position.addScaledVector(particle.velocity, deltaTime);
  confineToAttic(particle, bounds);
}

function updateExhaustPhase(particle, deltaTime, flowProfile) {
  particle.exhaustAge += deltaTime;

  const spreadFade = THREE.MathUtils.clamp(1 - (particle.exhaustAge / 3.2), 0.28, 1);
  const pull = THREE.MathUtils.clamp(
    particle.exhaustPullStrength || flowProfile.exhaustPullStrength || 0.2,
    0.15,
    1.2
  );
  const spreadVector = TEMP_VEC_4
    .copy(particle.exhaustSpreadDirection)
    .multiplyScalar(particle.exhaustSpreadStrength * spreadFade * (0.8 + (pull * 0.25)));

  let upwardLift = new THREE.Vector3(0, 0.5 + (pull * 0.42), 0).add(spreadVector);
  let ridgeLerp = 0.1;
  if (particle.exhaustKind === "ridge" && particle.isExitingRidge) {
    upwardLift = updateExitedRidgeParticle(particle, pull, spreadVector);
    ridgeLerp = 0.07;
  }

  particle.velocity.lerp(upwardLift, ridgeLerp);
  particle.position.addScaledVector(particle.velocity, deltaTime);
}

function shouldRemoveParticle(particle, bounds) {
  if (particle.phase === "exhaust" && particle.exitPoint) {
    const removalDistance = particle.exhaustRemovalDistance || 0.85;
    const movedAwayDistanceSq = particle.position.distanceToSquared(particle.exitPoint);
    const minTravelTime = particle.exhaustMinTravelTime || 0.2;
    if (
      particle.exhaustAge > minTravelTime &&
      shouldBeginRidgeFade(particle) &&
      movedAwayDistanceSq >= (removalDistance * removalDistance)
    ) {
      return true;
    }
  }

  if (particle.phase === "exhaust") {
    const ageTail = particle.exhaustKind === "ridge" ? RIDGE_EXIT_EXTRA_LIFE : 0;
    const maxExhaustAge =
      (particle.exhaustFadeDelay || 0) +
      (particle.exhaustFadeDuration || EXHAUST_FADE_OUT_SECONDS) +
      ageTail;
    if (particle.exhaustAge > maxExhaustAge) {
      return true;
    }
  }

  return false;
}

function updateAirflow(deltaTime) {
  if (!getGeometryStateRef || !getVentsRef || !airflowGroup) {
    return;
  }

  const dt = THREE.MathUtils.clamp(deltaTime || 0, 0, 0.05);
  const bounds = getAtticBounds();
  const ventState = getVentsRef();
  const ventilationMode = getVentilationMode(ventState);
  const flowProfile = getVentilationFlowProfile(bounds, ventState, ventilationMode);

  if (!simulationRunning) {
    // Setup mode: keep stale attic reservoir stable and ignore vents entirely.
    replenishStaleReservoir(dt, bounds, VentilationMode.NONE);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.age += dt;
      updateSetupModeParticle(particle, dt, bounds);
      recordTrailPoint(particle);
      applyParticleVisuals(particle);
      updateParticleTrail(particle);
      particle.mesh.position.copy(particle.position);
    }

    enforceParticlePopulationLimit();
    return;
  }

  // Simulation mode: enable full airflow system and vent interactions.
  spawnParticles(dt);
  replenishStaleReservoir(dt, bounds, ventilationMode);

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += dt;

    if (particle.phase === "exhaust" && shouldRemoveParticle(particle, bounds)) {
      disposeParticle(particle, i);
      continue;
    }

    if (particle.phase === "intake") {
      updateIntakePhase(particle, dt, bounds, ventState, flowProfile);
    } else if (particle.phase === "attic") {
      if (ventilationMode === VentilationMode.BALANCED && simulationRunning) {
        updateAtticPhase(particle, dt, bounds, ventState, flowProfile);
      } else {
        updateTrappedPhase(particle, dt, bounds, ventState, ventilationMode, flowProfile);
      }
    } else {
      updateExhaustPhase(particle, dt, flowProfile);
    }

    recordTrailPoint(particle);
    applyParticleVisuals(particle);
    updateParticleTrail(particle);
    particle.mesh.position.copy(particle.position);

    if (shouldRemoveParticle(particle, bounds)) {
      disposeParticle(particle, i);
    }
  }

  enforceParticlePopulationLimit();
}

export {
  initializeAirflowVisualization,
  startAirflowSimulation,
  stopAirflowSimulation,
  resetAirflowSimulation,
  updateAirflow,
  isSimulationRunning,
  clearParticles
};
