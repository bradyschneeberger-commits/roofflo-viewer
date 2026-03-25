/*
RoofFlo V2
File: modules/geometry/adapters/canonicalContainment.js

Purpose:
Unified roof containment adapter for the RoofFlo airflow simulation.

Provides a single interface for ceiling-height queries used by the airflow
system. Routes to canonical geometry lookup for supported roof types (gable,
shed, hip); falls back to legacy analytic containment if canonical mesh data
is unavailable.

All fallback decisions live here. No roof-type conditionals should be
scattered in the particle update loop.

Public API:
  initContainment(getGeometryStateFn)  — wire up geometry state accessor
  getRoofContainmentHeight(x, z, bounds) — ceiling Y for a given (x, z)
  getContainmentDiagnostics()            — snapshot for console debug
*/

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANONICAL_CONTAINMENT_EPSILON = 1e-6;
const CANONICAL_CONTAINMENT_ROOF_TYPES = new Set(["gable", "shed", "hip"]);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _getGeometryState = null;

let canonicalContainmentCache = {
  roofType: null,
  sourceGroup: null,
  roofMesh: null,
  triangles: [],
  isAvailable: false,
  reason: "uninitialized"
};
let lastContainmentPathLog = null;
let lastContainmentDiagnostics = {
  roofType: null,
  mode: "legacy",
  reason: "uninitialized"
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initContainment(getGeometryStateFn) {
  _getGeometryState = getGeometryStateFn || _getGeometryState;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function logContainmentPath(pathKey, message, level = "info") {
  if (lastContainmentPathLog === pathKey) {
    return;
  }

  lastContainmentPathLog = pathKey;
  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

function getCanonicalRoofMesh(group) {
  if (!group) {
    return null;
  }

  if (group.isMesh && group.geometry) {
    return group;
  }

  let roofMesh = null;
  group.traverse((node) => {
    if (roofMesh || !node?.isMesh || !node.geometry?.getAttribute) {
      return;
    }

    const position = node.geometry.getAttribute("position");
    if (position) {
      roofMesh = node;
    }
  });

  return roofMesh;
}

function shouldUseCanonicalContainmentForRoofType(roofType) {
  return CANONICAL_CONTAINMENT_ROOF_TYPES.has(roofType);
}

function rebuildCanonicalContainmentCache() {
  if (!_getGeometryState) {
    canonicalContainmentCache = {
      roofType: null,
      sourceGroup: null,
      roofMesh: null,
      triangles: [],
      isAvailable: false,
      reason: "missing-geometry-state-ref"
    };
    return canonicalContainmentCache;
  }

  const geometryState = _getGeometryState();
  const roofType = geometryState?.currentGeometryParams?.roofType;

  if (!shouldUseCanonicalContainmentForRoofType(roofType)) {
    canonicalContainmentCache = {
      roofType,
      sourceGroup: null,
      roofMesh: null,
      triangles: [],
      isAvailable: false,
      reason: "unsupported-roof-type"
    };
    return canonicalContainmentCache;
  }

  const sourceGroup = geometryState?.currentCanonicalRoofGroup;
  if (!sourceGroup) {
    canonicalContainmentCache = {
      roofType,
      sourceGroup: null,
      roofMesh: null,
      triangles: [],
      isAvailable: false,
      reason: "missing-canonical-group"
    };
    return canonicalContainmentCache;
  }

  const roofMesh = getCanonicalRoofMesh(sourceGroup);
  if (!roofMesh) {
    canonicalContainmentCache = {
      roofType,
      sourceGroup,
      roofMesh: null,
      triangles: [],
      isAvailable: false,
      reason: "missing-canonical-roof-mesh"
    };
    return canonicalContainmentCache;
  }

  const geometry = roofMesh.geometry;
  const positions = geometry?.getAttribute?.("position");
  if (!positions) {
    canonicalContainmentCache = {
      roofType,
      sourceGroup,
      roofMesh,
      triangles: [],
      isAvailable: false,
      reason: "missing-position-attribute"
    };
    return canonicalContainmentCache;
  }

  roofMesh.updateWorldMatrix(true, false);
  const worldMatrix = roofMesh.matrixWorld;
  const triList = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  const addTriangle = (ai, bi, ci) => {
    vA.fromBufferAttribute(positions, ai).applyMatrix4(worldMatrix);
    vB.fromBufferAttribute(positions, bi).applyMatrix4(worldMatrix);
    vC.fromBufferAttribute(positions, ci).applyMatrix4(worldMatrix);

    const denom = ((vB.z - vC.z) * (vA.x - vC.x)) + ((vC.x - vB.x) * (vA.z - vC.z));
    if (Math.abs(denom) <= CANONICAL_CONTAINMENT_EPSILON) {
      return;
    }

    triList.push({
      ax: vA.x,
      ay: vA.y,
      az: vA.z,
      bx: vB.x,
      by: vB.y,
      bz: vB.z,
      cx: vC.x,
      cy: vC.y,
      cz: vC.z,
      denom,
      minX: Math.min(vA.x, vB.x, vC.x),
      maxX: Math.max(vA.x, vB.x, vC.x),
      minZ: Math.min(vA.z, vB.z, vC.z),
      maxZ: Math.max(vA.z, vB.z, vC.z)
    });
  };

  const indices = geometry.getIndex();
  if (indices) {
    const indexArray = indices.array;
    for (let i = 0; i < indexArray.length; i += 3) {
      addTriangle(indexArray[i], indexArray[i + 1], indexArray[i + 2]);
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      addTriangle(i, i + 1, i + 2);
    }
  }

  canonicalContainmentCache = {
    roofType,
    sourceGroup,
    roofMesh,
    triangles: triList,
    isAvailable: triList.length > 0,
    reason: triList.length > 0 ? "ready" : "no-valid-triangles"
  };

  return canonicalContainmentCache;
}

function getCanonicalContainmentCache() {
  if (!_getGeometryState) {
    return rebuildCanonicalContainmentCache();
  }

  const geometryState = _getGeometryState();
  const activeRoofType = geometryState?.currentGeometryParams?.roofType;
  const activeGroup = geometryState?.currentCanonicalRoofGroup;

  if (
    canonicalContainmentCache.sourceGroup === activeGroup &&
    canonicalContainmentCache.roofType === activeRoofType
  ) {
    return canonicalContainmentCache;
  }

  return rebuildCanonicalContainmentCache();
}

function sampleCanonicalRoofLimitY(x, z) {
  const cache = getCanonicalContainmentCache();
  if (!cache.isAvailable) {
    return null;
  }

  // Multi-plane containment rule: for a given (x,z), use the highest valid
  // canonical roof triangle intersection. This keeps particles under the roof
  // near seams/ridges/hips where multiple faces may overlap numerically.
  let highestY = Number.NEGATIVE_INFINITY;
  for (const tri of cache.triangles) {
    if (
      x < tri.minX - CANONICAL_CONTAINMENT_EPSILON ||
      x > tri.maxX + CANONICAL_CONTAINMENT_EPSILON ||
      z < tri.minZ - CANONICAL_CONTAINMENT_EPSILON ||
      z > tri.maxZ + CANONICAL_CONTAINMENT_EPSILON
    ) {
      continue;
    }

    const u = (((tri.bz - tri.cz) * (x - tri.cx)) + ((tri.cx - tri.bx) * (z - tri.cz))) / tri.denom;
    const v = (((tri.cz - tri.az) * (x - tri.cx)) + ((tri.ax - tri.cx) * (z - tri.cz))) / tri.denom;
    const w = 1 - u - v;

    if (
      u < -CANONICAL_CONTAINMENT_EPSILON ||
      v < -CANONICAL_CONTAINMENT_EPSILON ||
      w < -CANONICAL_CONTAINMENT_EPSILON
    ) {
      continue;
    }

    const y = (u * tri.ay) + (v * tri.by) + (w * tri.cy);
    if (y > highestY) {
      highestY = y;
    }
  }

  return Number.isFinite(highestY) ? highestY : null;
}

function setContainmentDiagnostics(roofType, mode, reason) {
  lastContainmentDiagnostics = {
    roofType,
    mode,
    reason
  };
}

// ---------------------------------------------------------------------------
// Legacy analytic fallback
// (Used when canonical mesh is unavailable; kept here so all fallback logic
// lives in one place, alongside the canonical path.)
// ---------------------------------------------------------------------------

function getLegacyRoofLimitY(x, halfWidth, atticHeight, roofType) {
  if (!roofType) {
    console.error(
      "[RoofFlo Airflow] getLegacyRoofLimitY called without roof type. " +
      "This may cause incorrect particle visualization."
    );
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

function getLegacyRoofLimitForPosition(x, bounds) {
  return getLegacyRoofLimitY(x, bounds.halfWidth, bounds.atticHeight, bounds.roofType);
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

/**
 * getRoofContainmentHeight(x, z, bounds)
 *
 * Single entry point for all particle ceiling queries. Routes to canonical
 * geometry lookup for supported roof types; falls back to legacy analytic
 * containment if canonical data is unavailable.
 *
 * @param {number} x       World-space X of the particle
 * @param {number} z       World-space Z of the particle
 * @param {object} bounds  { roofType, halfWidth, halfLength, atticHeight }
 * @returns {number} Maximum allowed Y position at (x, z)
 */
function getRoofContainmentHeight(x, z, bounds) {
  if (shouldUseCanonicalContainmentForRoofType(bounds.roofType)) {
    const canonicalRoofLimit = sampleCanonicalRoofLimitY(x, z);
    if (Number.isFinite(canonicalRoofLimit)) {
      setContainmentDiagnostics(bounds.roofType, "canonical", "ready");
      logContainmentPath(
        `canonical-${bounds.roofType}-containment`,
        `[RoofFlo Airflow] Using canonical ${bounds.roofType} containment.`
      );
      return canonicalRoofLimit;
    }

    const reason = getCanonicalContainmentCache().reason;
    setContainmentDiagnostics(bounds.roofType, "legacy", reason);
    logContainmentPath(
      `fallback-${bounds.roofType}-${reason}`,
      `[RoofFlo Airflow] Canonical ${bounds.roofType} containment unavailable (${reason}); falling back to legacy containment.`,
      "warn"
    );
  } else {
    setContainmentDiagnostics(bounds.roofType, "legacy", "unsupported-roof-type");
  }

  return getLegacyRoofLimitForPosition(x, bounds);
}

/**
 * getContainmentDiagnostics()
 *
 * Returns a snapshot of the current containment routing state. Call from
 * the browser console to inspect which path is active and why.
 *
 * Returns: { roofType, mode, reason, canonicalRoofType, canonicalAvailable,
 *            canonicalReason, canonicalTriangleCount }
 */
function getContainmentDiagnostics() {
  const cache = getCanonicalContainmentCache();
  return {
    roofType: lastContainmentDiagnostics.roofType,
    mode: lastContainmentDiagnostics.mode,
    reason: lastContainmentDiagnostics.reason,
    canonicalRoofType: cache.roofType,
    canonicalAvailable: cache.isAvailable,
    canonicalReason: cache.reason,
    canonicalTriangleCount: cache.triangles.length
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  initContainment,
  getRoofContainmentHeight,
  getContainmentDiagnostics
};
