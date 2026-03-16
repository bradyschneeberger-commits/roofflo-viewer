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

const PARTICLE_COLOR = 0xd8fbff;
const PARTICLE_SIZE = 0.032;
const PARTICLE_OPACITY = 2.5;
const MAX_PARTICLES = 1000;
const SPAWN_INTERVAL_SECONDS = 0.14;
const PARTICLE_MAX_AGE_SECONDS = 20;
const SPAWN_FADE_IN_SECONDS = 0.14;
const DEATH_FADE_OUT_SECONDS = 5.5;
const EXHAUST_FADE_OUT_SECONDS = 10;
const STATIC_VENT_SIZE_FEET = 0.75;
const RIDGE_VENT_WIDTH_FEET = 2 / 12;

const PARTICLE_GEOMETRY = new THREE.SphereGeometry(1, 8, 8);

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

let sceneRef = null;
let getGeometryStateRef = null;
let getVentsRef = null;

const particles = [];

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
  spawnAccumulator = 0;
  return true;
}

function stopAirflowSimulation() {
  simulationRunning = false;
  spawnAccumulator = 0;
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
}

function createParticleMesh(position) {
  const material = new THREE.MeshBasicMaterial({
    color: PARTICLE_COLOR,
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
  const ageRatio = THREE.MathUtils.clamp(particle.age / particle.maxAge, 0, 1);
  const fadeIn = THREE.MathUtils.clamp(particle.age / SPAWN_FADE_IN_SECONDS, 0, 1);
  const fadeOut = THREE.MathUtils.clamp((particle.maxAge - particle.age) / DEATH_FADE_OUT_SECONDS, 0, 1);
  const pulse = 0.94 + (Math.sin((particle.age * particle.pulseSpeed) + particle.pulseOffset) * 0.06);

  let exhaustFade = 1;
  if (particle.phase === "exhaust") {
    exhaustFade = THREE.MathUtils.clamp(1 - (particle.exhaustAge / EXHAUST_FADE_OUT_SECONDS), 0, 1);
  }

  const lifeAlpha = fadeIn * fadeOut * exhaustFade;
  const ageSoftness = 1 - (ageRatio * 0.06);
  const targetOpacity = particle.baseOpacity * phaseVisual.opacityMul * lifeAlpha * ageSoftness;

  particle.mesh.material.opacity = targetOpacity;
  particle.mesh.material.color.copy(phaseVisual.color);

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

function spawnParticles(deltaTime) {
  if (!simulationRunning) {
    return;
  }

  const ventState = getVentsRef();
  const intakeVents = ventState.intakeVents || [];
  if (!intakeVents.length || particles.length >= MAX_PARTICLES) {
    return;
  }

  spawnAccumulator += deltaTime;
  while (spawnAccumulator >= SPAWN_INTERVAL_SECONDS && particles.length < MAX_PARTICLES) {
    spawnAccumulator -= SPAWN_INTERVAL_SECONDS;
    for (const intakeVent of intakeVents) {
      if (particles.length >= MAX_PARTICLES) {
        break;
      }
      createParticleFromIntakeVent(intakeVent);
    }
  }
}

function updateIntakePhase(particle, deltaTime, bounds) {
  const inwardDirection = particle.side === "left" ? 1 : -1;
  const desired = new THREE.Vector3(
    inwardDirection * 0.95,
    0.34,
    (Math.random() - 0.5) * 0.1
  );

  particle.velocity.lerp(desired, 0.16);
  particle.position.addScaledVector(particle.velocity, deltaTime);

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
      const targetStrength = 0.3 + (heightRatio * 0.45) + (centerRatio * 0.1) + (distanceFactor * 0.35);
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
  if (particle.age >= particle.maxAge) {
    return true;
  }

  if (particle.phase === "exhaust" && particle.exhaustAge > EXHAUST_FADE_OUT_SECONDS) {
    return true;
  }

  if (Math.abs(particle.position.z) > bounds.halfLength + 2) {
    return true;
  }

  return false;
}

function updateAirflow(deltaTime) {
  if (!simulationRunning || !getGeometryStateRef || !getVentsRef || !airflowGroup) {
    return;
  }

  const dt = THREE.MathUtils.clamp(deltaTime || 0, 0, 0.05);
  const bounds = getAtticBounds();
  const ventState = getVentsRef();

  spawnParticles(dt);

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += dt;

    if (particle.phase === "intake") {
      updateIntakePhase(particle, dt, bounds);
    } else if (particle.phase === "attic") {
      updateAtticPhase(particle, dt, bounds, ventState);
    } else {
      updateExhaustPhase(particle, dt);
    }

    applyParticleVisuals(particle);
    particle.mesh.position.copy(particle.position);

    if (shouldRemoveParticle(particle, bounds)) {
      disposeParticle(particle, i);
    }
  }
}

export {
  startAirflowSimulation,
  stopAirflowSimulation,
  resetAirflowSimulation,
  updateAirflow,
  isSimulationRunning,
  clearParticles
};
