/**
 * @fileoverview Dev-only diagnostic runner for the canonical roof pipeline.
 *
 * This script is intentionally disconnected from the V3 app flow.
 * It runs the pure data pipeline end-to-end for gable/shed/hip and prints
 * compact summaries for quick verification.
 */

import { createGableRoof } from '../../roofTypes/gable.js';
import { createShedRoof } from '../../roofTypes/shed.js';
import { createHipRoof } from '../../roofTypes/hip.js';
import { buildAttic } from './buildAttic.js';
import { buildMesh } from './buildMesh.js';

/**
 * Count classified edges by classification label.
 *
 * @param {Array<{ classification?: string }>} classifiedEdges
 * @returns {Record<string, number>}
 */
function countByClassification(classifiedEdges) {
  /** @type {Record<string, number>} */
  const counts = {
    eave: 0,
    ridge: 0,
    hip: 0,
    rake: 0,
    highEdge: 0,
    unknown: 0,
  };

  for (const edge of classifiedEdges) {
    const key = edge.classification ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

/**
 * Count faces that appear to have zero normals.
 *
 * buildMesh duplicates one face normal per vertex of the face, so we inspect
 * the first normal triplet for each face range.
 *
 * @param {{ normals: number[], faceRanges: Array<{ vertexStart: number, vertexCount: number }> }} meshData
 * @returns {number}
 */
function countZeroNormalFaces(meshData) {
  let zeroCount = 0;

  for (const range of meshData.faceRanges) {
    if (range.vertexCount <= 0) {
      continue;
    }

    const base = range.vertexStart * 3;
    const nx = meshData.normals[base] ?? 0;
    const ny = meshData.normals[base + 1] ?? 0;
    const nz = meshData.normals[base + 2] ?? 0;

    if (nx === 0 && ny === 0 && nz === 0) {
      zeroCount += 1;
    }
  }

  return zeroCount;
}

/**
 * Build a compact summary object for logging.
 *
 * @param {ReturnType<typeof buildAttic>} result
 * @param {ReturnType<typeof buildMesh>} meshData
 */
function summarize(result, meshData) {
  return {
    roofType: result.roofType,
    isValid: result.isValid,
    errors: result.errors,
    faces: result.faces.length,
    edges: result.edges.length,
    classifications: countByClassification(result.classifiedEdges),
    references: {
      intake: result.references.intake.length,
      ridge: result.references.ridge.length,
      exhaust: result.references.exhaust.length,
    },
    zones: {
      intake: result.zones.intake.length,
      ridge: result.zones.ridge.length,
      exhaust: result.zones.exhaust.length,
    },
    mesh: {
      vertexCount: meshData.vertices.length / 3,
      triangleCount: meshData.indices.length / 3,
      faceRanges: meshData.faceRanges,
      zeroNormalFaceCount: countZeroNormalFaces(meshData),
    },
    atticStatus: result.attic.status,
  };
}

const sampleParams = {
  // Representative defaults aligned to current geometry defaults used in the repo.
  gable: { width: 30, length: 50, pitch: 6, overhang: 0 },
  shed: { width: 20, length: 40, pitch: 4, overhang: 0 },
  hip: { width: 30, length: 50, pitch: 6, overhang: 0 },
};

const samples = [
  createGableRoof(sampleParams.gable),
  createShedRoof(sampleParams.shed),
  createHipRoof(sampleParams.hip),
];

console.log('=== RoofFlo Canonical Pipeline Diagnostics ===');

for (const roofDefinition of samples) {
  const result = buildAttic(roofDefinition);
  const meshData = buildMesh(result.faces);
  const summary = summarize(result, meshData);

  console.log(`\n[${summary.roofType.toUpperCase()}]`);
  console.log(JSON.stringify(summary, null, 2));
}
