/**
 * @fileoverview Pipeline Stage 4 — Build placement references from classified edges.
 *
 * Groups ClassifiedEdge objects by their ventilation role to produce a
 * PlacementReferences object that downstream stages (buildZones, vent placement)
 * can consume without knowing about edge geometry directly.
 *
 * Reference derivation rules (this stage):
 *
 *   intake  ← edges classified "eave"
 *              Eave edges sit at the lowest roof boundary and are the canonical
 *              intake vent mounting surface for all roof types.
 *
 *   ridge   ← edges classified "ridge"
 *              The true ridge line shared by two faces.  Empty for shed (no ridge).
 *
 *   exhaust ← edges classified "ridge" PLUS edges classified "highEdge"
 *              Ridge edges cover gable and hip exhausts.
 *              highEdge covers the elevated eave line of a shed, which is the
 *              only exhaust reference available when there is no ridge.
 *
 * Explicitly excluded from all reference buckets:
 *   "hip"     — structural hip diagonals; not a placement surface by default
 *   "rake"    — gable end / shed side diagonals; not a placement surface
 *   "unknown" — unclassified; not used until future stages define them
 *
 * No Three.js. No rendering. Pure data transformation.
 *
 * @module geometry/pipeline/buildReferences
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').ClassifiedEdge}      ClassifiedEdge      */
/** @typedef {import('../types.js').PlacementReferences} PlacementReferences */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive placement references from a classified edge list.
 *
 * The input must be the output of classifyEdges() — every edge needs a
 * `classification` field.  The input array is not mutated.
 *
 * @param {ClassifiedEdge[]} classifiedEdges - Output of classifyEdges()
 * @returns {PlacementReferences}
 *
 * @example
 * // Shed  → intake: [1 eave], ridge: [],          exhaust: [1 highEdge]
 * // Gable → intake: [2 eave], ridge: [1 ridge],   exhaust: [1 ridge]
 * // Hip   → intake: [4 eave], ridge: [1 ridge],   exhaust: [1 ridge]
 *
 * const refs = buildReferences(classifiedEdges);
 */
export function buildReferences(classifiedEdges) {
  // ---------------------------------------------------------------------------
  // intake — eave edges
  //
  // Eave edges are the low horizontal boundary of the roof.  They are the
  // natural mounting surface for soffit / eave intake vents on all roof types.
  // ---------------------------------------------------------------------------
  const intake = classifiedEdges.filter(e => e.classification === 'eave');

  // ---------------------------------------------------------------------------
  // ridge — true ridge edges only
  //
  // A "ridge" edge is a horizontal shared edge at the global peak elevation.
  // Shed has no shared edges → ridge is empty for shed. ✓
  // ---------------------------------------------------------------------------
  const ridge = classifiedEdges.filter(e => e.classification === 'ridge');

  // ---------------------------------------------------------------------------
  // exhaust — ridge edges + highEdge edges
  //
  // For roofs with a physical ridge (gable, hip):
  //   ridge edges → ridge vent / baffled exhaust at the peak.
  //
  // For shed (no ridge):
  //   highEdge is the elevated horizontal eave on the high side of the roof.
  //   It is the only viable exhaust reference when no ridge exists.
  //
  // Both classifications can coexist in theory (future multi-ridge shapes),
  // so we concatenate rather than choose one or the other.
  // ---------------------------------------------------------------------------
  const exhaust = classifiedEdges.filter(
    e => e.classification === 'ridge' || e.classification === 'highEdge'
  );

  // Hip edges and rake edges are not included in any reference bucket at this
  // stage.  Hip vents are a potential future extension (add hip edges to intake
  // or a dedicated "hip" bucket here when that feature is designed).

  /** @type {PlacementReferences} */
  const references = { intake, exhaust, ridge };

  return references;
}
