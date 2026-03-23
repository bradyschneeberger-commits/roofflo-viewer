/**
 * @fileoverview Pipeline Stage 1 — Derive edges from face definitions.
 *
 * Walks every face in a RoofDefinition and produces a deduplicated list of
 * DerivedEdge objects.
 *
 * After derivation each edge carries:
 *   - start / end  : the original geometric direction as first seen
 *   - faceIds      : all face IDs that share the edge (1 = perimeter, 2 = shared)
 *   - kind         : "perimeter" | "shared"  (overabundant edges noted via _overabundant)
 *
 * Classification into ridge / eave / hip / gable belongs to classifyEdges.js —
 * this stage is deliberately kind-agnostic beyond shared/perimeter.
 *
 * No Three.js. No rendering. Pure data transformation.
 *
 * @module geometry/pipeline/deriveEdges
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').RoofFace}    RoofFace    */
/** @typedef {import('../types.js').DerivedEdge} DerivedEdge */

/**
 * Extended DerivedEdge returned by this module.
 * The optional `_overabundant` flag is set when more than 2 faces share an edge,
 * which indicates malformed input geometry.
 *
 * @typedef {DerivedEdge & { kind: "shared" | "perimeter", _overabundant?: true }} RawEdge
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a vertex to a compact, deterministic string key.
 *
 * We use a fixed decimal precision (6 places) so that floating-point values
 * that are mathematically equal but have trivial representation differences
 * (e.g. 15.0 vs 15.000001 after arithmetic) hash to the same key.
 *
 * Assumption: input vertices are the exact same objects / values across faces —
 * no spatial tolerance search is needed for the current roof type definitions.
 *
 * @param {{ x: number, y: number, z: number }} v
 * @returns {string}
 */
function vertexToKey(v) {
  // toFixed(6) gives us sub-millimetre precision at the foot scale used by RoofFlo.
  return `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
}

/**
 * Produce a canonical, direction-independent key for an edge defined by two vertices.
 *
 * A→B and B→A must map to the same key so that shared edges between faces
 * are correctly merged regardless of winding order.
 *
 * Strategy: build both vertex keys, then sort them lexicographically.
 * Lexicographic sort is deterministic and requires no geometry assumptions.
 *
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 * @returns {string}
 */
function normalizedEdgeKey(a, b) {
  const ka = vertexToKey(a);
  const kb = vertexToKey(b);
  // Sort so that the smaller key always comes first.
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive all edges from a list of roof faces.
 *
 * Algorithm:
 *  1. For every face, walk its vertex list in order and emit one raw edge per
 *     consecutive pair (v[i] → v[i+1]).  The last vertex wraps back to v[0].
 *  2. Index each raw edge by its normalizedEdgeKey.
 *  3. On first encounter: store the edge entry (preserving original direction).
 *  4. On subsequent encounter: accumulate the faceId.
 *  5. After all faces are processed, finalise kind from faceIds.length.
 *
 * Expected outcomes by roof type:
 *   Shed  → all 4 edges are perimeter (single face, no shared edges)
 *   Gable → 1 shared edge (the ridge: face-left and face-right both touch it),
 *            4 perimeter edges (2 eaves, 2 gable ends)
 *   Hip   → 4 shared hip edges + 1 shared ridge edge = 5 shared,
 *            4 perimeter eave edges
 *
 * @param {RoofFace[]} faces - Faces from a RoofDefinition
 * @returns {RawEdge[]}      - Deduplicated edge list
 *
 * @example
 * const edges = deriveEdges(roofDefinition.faces);
 * const shared    = edges.filter(e => e.kind === 'shared');
 * const perimeter = edges.filter(e => e.kind === 'perimeter');
 */
export function deriveEdges(faces) {
  /**
   * Accumulator keyed by normalizedEdgeKey.
   * Each entry stores the DerivedEdge in its original geometric direction
   * plus the list of face IDs that have referenced this edge.
   *
   * @type {Map<string, { start: object, end: object, faceIds: string[] }>}
   */
  const edgeMap = new Map();

  for (const face of faces) {
    const verts = face.vertices;
    const n = verts.length;

    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n]; // wrap: last vertex → first vertex

      const key = normalizedEdgeKey(a, b);

      if (!edgeMap.has(key)) {
        // First time we see this edge — preserve the direction this face gives us
        // as the canonical start/end.  Subsequent faces may traverse it in reverse,
        // but we keep only this first-seen direction.
        edgeMap.set(key, { start: a, end: b, faceIds: [face.id] });
      } else {
        // Edge already registered from a different face — accumulate faceId.
        edgeMap.get(key).faceIds.push(face.id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Finalise: convert accumulated map entries into RawEdge objects
  // ---------------------------------------------------------------------------

  /** @type {RawEdge[]} */
  const edges = [];
  let edgeIndex = 0;

  for (const [, entry] of edgeMap) {
    const faceCount = entry.faceIds.length;

    // Nominal cases: 1 face = perimeter, 2 faces = shared.
    // > 2 faces indicates malformed geometry; we still include the edge but flag it.
    const kind = faceCount >= 2 ? 'shared' : 'perimeter';

    /** @type {RawEdge} */
    const edge = {
      id:      `edge-${edgeIndex}`,
      start:   entry.start,
      end:     entry.end,
      faceIds: entry.faceIds,
      kind,
    };

    if (faceCount > 2) {
      // More than two faces share this edge — this should not happen for valid
      // manifold roof geometry.  Flag it so callers can detect bad input without
      // silently discarding information.
      edge._overabundant = true;
    }

    edges.push(edge);
    edgeIndex++;
  }

  return edges;
}
