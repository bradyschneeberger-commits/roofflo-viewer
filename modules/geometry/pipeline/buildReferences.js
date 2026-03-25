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
/** @typedef {import('../types.js').RoofDefinition}      RoofDefinition      */

function cloneVertex(vertex) {
  return {
    x: vertex.x,
    y: vertex.y,
    z: vertex.z,
  };
}

function normalizeShedHighEdgeForExhaust(edge, roofDefinition) {
  const metadata = roofDefinition?.metadata ?? {};
  const width = Number(metadata.width);
  const length = Number(metadata.length);
  const pitch = Number(metadata.pitch);
  const overhang = Math.max(0, Number(metadata.overhang) || 0);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    !Number.isFinite(pitch)
  ) {
    return edge;
  }

  const riseHeight = (width * pitch) / 12;
  const normalizedEdge = {
    ...edge,
    start: { x: width, y: riseHeight, z: 0 },
    end: { x: width, y: riseHeight, z: length },
    metadata: {
      ...(edge.metadata ?? {}),
      derivedFrom: 'shed-enclosed-high-wall',
      excludesOverhangArea: true,
      enclosedBoundary: {
        start: { x: width, y: riseHeight, z: 0 },
        end: { x: width, y: riseHeight, z: length },
      },
      outerRoofEdge: {
        start: cloneVertex(edge.start),
        end: cloneVertex(edge.end),
      },
      overhangDepth: overhang,
    },
  };

  return normalizedEdge;
}

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
 * @param {RoofDefinition} [roofDefinition]  - Source roof definition metadata
 * @returns {PlacementReferences}
 *
 * @example
 * // Shed  → intake: [1 eave], ridge: [],          exhaust: [1 highEdge]
 * // Gable → intake: [2 eave], ridge: [1 ridge],   exhaust: [1 ridge]
 * // Hip   → intake: [4 eave], ridge: [1 ridge],   exhaust: [1 ridge]
 *
 * const refs = buildReferences(classifiedEdges, roofDefinition);
 */
export function buildReferences(classifiedEdges, roofDefinition = null) {
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
  const exhaust = classifiedEdges
    .filter(e => e.classification === 'ridge' || e.classification === 'highEdge')
    .map(edge => {
      if (roofDefinition?.roofType === 'shed' && edge.classification === 'highEdge') {
        return normalizeShedHighEdgeForExhaust(edge, roofDefinition);
      }

      return edge;
    });

  // Hip edges and rake edges are not included in any reference bucket at this
  // stage.  Hip vents are a potential future extension (add hip edges to intake
  // or a dedicated "hip" bucket here when that feature is designed).

  /** @type {PlacementReferences} */
  const references = { intake, exhaust, ridge };

  return references;
}
