/**
 * @fileoverview Pipeline Stage 6 — Assemble the full AtticResult.
 *
 * Orchestrates the entire pipeline:
 *   faces → deriveEdges → classifyEdges → buildReferences → buildZones
 *
 * The `buildMesh` stage is intentionally called separately (it will require
 * Three.js) and its output is merged in here once available.
 *
 * No Three.js. No rendering yet. Pure data orchestration.
 *
 * @module geometry/pipeline/buildAttic
 */

import { deriveEdges }      from './deriveEdges.js';
import { classifyEdges }    from './classifyEdges.js';
import { buildReferences }  from './buildReferences.js';
import { buildZones }       from './buildZones.js';
import { validateFaces }    from './validateRoof.js';

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').RoofDefinition} RoofDefinition */
/** @typedef {import('../types.js').RoofFace}       RoofFace       */
/** @typedef {import('../types.js').DerivedEdge}    DerivedEdge    */
/** @typedef {import('../types.js').ClassifiedEdge} ClassifiedEdge */
/** @typedef {import('../types.js').PlacementReferences} PlacementReferences */
/** @typedef {import('../types.js').ZoneMap}             ZoneMap             */

/**
 * Canonical orchestration result for the data pipeline.
 *
 * @typedef {Object} BuildAtticResult
 * @property {boolean} isValid
 * @property {string[]} errors
 * @property {string} roofType
 * @property {RoofFace[]} faces
 * @property {DerivedEdge[]} edges
 * @property {ClassifiedEdge[]} classifiedEdges
 * @property {PlacementReferences} references
 * @property {ZoneMap} zones
 * @property {{ status: 'not_implemented', volume: null, metadata?: object }} attic
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full geometry pipeline for a RoofDefinition.
 *
 * @param {RoofDefinition} roofDefinition - Output of a roof type module (gable.js etc.)
 * @returns {BuildAtticResult}
 *
 * @example
 * const attic = buildAttic(createGableRoof({ width: 30, length: 50, pitch: 6 }));
 */
export function buildAttic(roofDefinition) {
  // Preserve input data shape without mutation.
  const roofType = roofDefinition?.roofType ?? 'unknown';
  const faces = Array.isArray(roofDefinition?.faces) ? [...roofDefinition.faces] : [];

  // Stage 1: Validate face data.
  const validation = validateFaces(faces);

  /** @type {DerivedEdge[]} */
  let edges = [];
  /** @type {ClassifiedEdge[]} */
  let classifiedEdges = [];
  /** @type {PlacementReferences} */
  let references = { intake: [], exhaust: [], ridge: [] };
  /** @type {ZoneMap} */
  let zones = { intake: [], exhaust: [], ridge: [] };

  // Stages 2-5 run only for valid input.
  // Invalid inputs still return the full shape with stable empty downstream data.
  if (validation.isValid) {
    // Stage 2: Derive normalized perimeter/shared edges from faces.
    edges = deriveEdges(faces);
    // Stage 3: Classify each edge (eave/ridge/hip/rake/highEdge/unknown).
    classifiedEdges = classifyEdges(edges);
    // Stage 4: Group classified edges into intake/exhaust/ridge references.
    references = buildReferences(classifiedEdges, roofDefinition);
    // Stage 5: Derive visual zone descriptors from references.
    zones = buildZones(references);
  }

  // Attic geometry generation is intentionally deferred.
  // This placeholder keeps a stable contract until real attic volume/shape
  // computation is introduced in a later phase.
  const attic = {
    status: 'not_implemented',
    volume: null,
    metadata: roofDefinition?.metadata ?? {},
  };

  /** @type {BuildAtticResult} */
  const atticResult = {
    isValid: validation.isValid,
    errors: validation.errors,
    roofType,
    faces,
    edges,
    classifiedEdges,
    references,
    zones,
    attic,
  };

  return atticResult;
}
