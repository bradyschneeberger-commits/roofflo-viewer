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

const PARTICLE_GEOMETRY = new THREE.SphereGeometry(1, 8, 8);
const STALE_AIR_TINT = new THREE.Color(STALE_AIR_COLOR);
const FRESH_AIR_TINT = new THREE.Color(FRESH_AIR_COLOR);

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

let airflowGroup = null;
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

function applyParticleVisuals(particle) {
  const phaseVisual = PHASE_VISUALS[particle.phase] || PHASE_VISUALS.attic;
  const fadeIn = THREE.MathUtils.clamp(particle.age / SPAWN_FADE_IN_SECONDS, 0, 1);
  const pulse = 0.94 + (Math.sin((particle.age * particle.pulseSpeed) + particle.pulseOffset) * 0.06);

  let exhaustFade = 1;
  if (particle.phase === "exhaust") {
    exhaustFade = THREE.MathUtils.clamp(1 - (particle.exhaustAge / EXHAUST_FADE_OUT_SECONDS), 0, 1);
  }

  const lifeAlpha = fadeIn * exhaustFade;
  const targetOpacity = particle.baseOpacity * phaseVisual.opacityMul * lifeAlpha;

  particle.mesh.material.opacity = targetOpacity;

  const freshness = THREE.MathUtils.clamp(
    particle.freshness ?? (particle.type === "fresh" ? 1 : 0),
    0,
    1
  );
  const targetColor = STALE_AIR_TINT.clone().lerp(FRESH_AIR_TINT, freshness);
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

function getAtticBounds() {
  const geometry = getGeometryStateRef();
  const params = geometry.currentGeometryParams || {};

  const buildingWidth = params.buildingWidth || 30;
  const buildingLength = params.buildingLength || 50;
  const halfWidth = buildingWidth / 2;
  const halfLength = buildingLength / 2;
  const atticHeight = geometry.atticHeight || 1;

  return { halfWidth, halfLength, atticHeight };
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

function getRandomPointInsideAttic(bounds) {
  const xPadding = 0.3;
  const zPadding = 0.3;
  const x = THREE.MathUtils.lerp(-bounds.halfWidth + xPadding, bounds.halfWidth - xPadding, Math.random());
  const z = THREE.MathUtils.lerp(-bounds.halfLength + zPadding, bounds.halfLength - zPadding, Math.random());
  const roofLimit = getRoofLimitY(x, bounds.halfWidth, bounds.atticHeight);
  const maxY = Math.max(0.2, roofLimit - 0.08);
  const y = THREE.MathUtils.lerp(0.06, maxY, Math.random());
  return new THREE.Vector3(x, y, z);
}

function createTrappedParticle(position) {
  const mesh = createParticleMesh(position);
  airflowGroup.add(mesh);

  particles.push({
    mesh,
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

function getRoofLimitY(x, halfWidth, atticHeight) {
  if (halfWidth <= 0) {
    return atticHeight;
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

  const roofLimit = getRoofLimitY(particle.position.x, bounds.halfWidth, bounds.atticHeight);
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
  const inwardDirection = intakeVent.side === "left" ? 1 : -1;
  const startPosition = getRandomIntakeSpawnPosition(intakeVent);
  startPosition.x += inwardDirection * 0.16;
  startPosition.y += 0.04;

  const mesh = createParticleMesh(startPosition);
  airflowGroup.add(mesh);

  particles.push({
    mesh,
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

function updateIntakePhase(particle, deltaTime, bounds) {
  const inwardDirection = particle.side === "left" ? 1 : -1;
  const inwardStrength = simulationRunning ? 0.95 : 0.42;
  const upwardStrength = simulationRunning ? 0.34 : 0.16;
  const lateralStrength = simulationRunning ? 0.1 : 0.24;

  const desired = new THREE.Vector3(
    inwardDirection * inwardStrength,
    upwardStrength,
    (Math.random() - 0.5) * lateralStrength
  );

  particle.velocity.lerp(desired, 0.16);
  particle.position.addScaledVector(particle.velocity, deltaTime);

  if (particle.type === "fresh") {
    particle.freshAge += deltaTime;
    particle.freshness = Math.min(1, (particle.freshness ?? 1) + (deltaTime * 0.2));
  }

  const nearAtticEdge = particle.side === "left"
    ? particle.position.x >= -bounds.halfWidth + 0.18
    : particle.position.x <= bounds.halfWidth - 0.18;
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

function updateAtticPhase(particle, deltaTime, bounds, ventState) {
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
    (Math.random() - 0.5) * 0.1,
    (Math.random() - 0.5) * 0.05,
    (Math.random() - 0.5) * 0.14
  );

  let desired = centerBias.add(lateralSpread).add(circulation).add(turbulence);
  const nearestTarget = getNearestExhaustTarget(particle.position, ventState);
  if (nearestTarget) {
    const toTarget = nearestTarget.position.clone().sub(particle.position);
    const distance = toTarget.length();
    if (distance > 0.0001) {
      const distanceFactor = 1 - THREE.MathUtils.clamp(distance / Math.max(bounds.halfLength, 1), 0, 1);
      const targetStrength = (0.3 + (heightRatio * 0.45) + (centerRatio * 0.1) + (distanceFactor * 0.35)) * BALANCED_DIRECTIONAL_BOOST;
      toTarget.normalize().multiplyScalar(targetStrength);
      desired.add(toTarget);
    }

    particle.targetExhaust = nearestTarget;
    if (distance < 0.35) {
      const exitPoint = getRandomExhaustExitPoint(nearestTarget) || nearestTarget.position;
      const spread = getExhaustSpreadForTarget(nearestTarget);
      particle.phase = "exhaust";
      particle.exhaustAge = 0;
      particle.exitPoint = exitPoint.clone();
      particle.exhaustSpreadDirection.copy(spread.direction);
      particle.exhaustSpreadStrength = spread.strength;
      particle.velocity.copy(nearestTarget.normal.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.35, 0)));
      particle.position.copy(exitPoint);
    }
  } else {
    particle.targetExhaust = null;
  }

  particle.velocity.lerp(desired, 0.08);
  particle.position.addScaledVector(particle.velocity, deltaTime);
  confineToAttic(particle, bounds);
}

function updateTrappedPhase(particle, deltaTime, bounds, ventState, mode) {
  const driftNoise = new THREE.Vector3(
    (Math.random() - 0.5) * 0.12,
    (Math.random() - 0.5) * 0.05,
    (Math.random() - 0.5) * 0.12
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
    .add(new THREE.Vector3(0, TRAPPED_UPWARD_BIAS, 0));

  if (mode === VentilationMode.EXHAUST_ONLY) {
    const nearestTarget = getNearestExhaustTarget(particle.position, ventState);
    if (nearestTarget) {
      const toTarget = nearestTarget.position.clone().sub(particle.position);
      const distance = toTarget.length();
      if (distance > 0.0001) {
        toTarget.normalize().multiplyScalar(WEAK_ESCAPE_STRENGTH);
        trappedDesired.add(toTarget);
      }

      if (distance < 0.32) {
        const exitPoint = getRandomExhaustExitPoint(nearestTarget) || nearestTarget.position;
        const spread = getExhaustSpreadForTarget(nearestTarget);
        particle.phase = "exhaust";
        particle.exhaustAge = 0;
        particle.exitPoint = exitPoint.clone();
        particle.exhaustSpreadDirection.copy(spread.direction);
        particle.exhaustSpreadStrength = spread.strength * 0.6;
        particle.velocity.copy(nearestTarget.normal.clone().multiplyScalar(0.58).add(new THREE.Vector3(0, 0.26, 0)));
        particle.position.copy(exitPoint);
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

  particle.velocity.lerp(trappedDesired, 0.06);
  particle.position.addScaledVector(particle.velocity, deltaTime);
  confineToAttic(particle, bounds);
}

function updateExhaustPhase(particle, deltaTime) {
  particle.exhaustAge += deltaTime;

  const spreadFade = THREE.MathUtils.clamp(1 - (particle.exhaustAge / 3.2), 0.28, 1);
  const spreadVector = particle.exhaustSpreadDirection
    .clone()
    .multiplyScalar(particle.exhaustSpreadStrength * spreadFade);
  const upwardLift = new THREE.Vector3(0, 0.75, 0).add(spreadVector);

  particle.velocity.lerp(upwardLift, 0.1);
  particle.position.addScaledVector(particle.velocity, deltaTime);
}

function shouldRemoveParticle(particle, bounds) {
  if (particle.phase === "exhaust" && particle.exhaustAge > EXHAUST_FADE_OUT_SECONDS) {
    return true;
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

  if (!simulationRunning) {
    // Setup mode: keep stale attic reservoir stable and ignore vents entirely.
    replenishStaleReservoir(dt, bounds, VentilationMode.NONE);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.age += dt;
      updateSetupModeParticle(particle, dt, bounds);
      applyParticleVisuals(particle);
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

    if (particle.phase === "intake") {
      updateIntakePhase(particle, dt, bounds);
    } else if (particle.phase === "attic") {
      if (ventilationMode === VentilationMode.BALANCED && simulationRunning) {
        updateAtticPhase(particle, dt, bounds, ventState);
      } else {
        updateTrappedPhase(particle, dt, bounds, ventState, ventilationMode);
      }
    } else {
      updateExhaustPhase(particle, dt);
    }

    applyParticleVisuals(particle);
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
