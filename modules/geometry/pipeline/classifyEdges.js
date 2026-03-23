/**
 * @fileoverview Pipeline Stage 2 — Classify derived edges geometrically.
 *
 * Consumes the output of deriveEdges() and adds a `classification` field to
 * every edge.  No roof-type names are used — all decisions are based on vertex
 * elevations (Y coordinates) and whether the edge is shared or perimeter.
 *
 * Supported classifications (this stage):
 *
 *   Shared edges
 *   "ridge"    — shared, horizontal, at the global peak of all shared edges
 *   "hip"      — shared, sloped (endpoints at different Y)
 *   "unknown"  — shared, but neither rule matches (reserved for valley etc.)
 *
 *   Perimeter edges
 *   "eave"     — perimeter, horizontal, at the global minimum roof elevation
 *   "highEdge" — perimeter, horizontal, above minimum elevation, on a roof
 *                with NO shared edges (i.e. shed — the high-side eave line)
 *   "rake"     — perimeter, sloped (gable end diagonals, shed side edges)
 *   "unknown"  — perimeter, horizontal, elevated, but shared edges exist
 *                (reserved for clerestory / future cases)
 *
 * Not yet implemented: "valley", "gable" (vertical perimeter end-wall).
 *
 * No Three.js. No rendering. Pure data transformation.
 *
 * @module geometry/pipeline/classifyEdges
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').DerivedEdge}    DerivedEdge    */
/** @typedef {import('../types.js').ClassifiedEdge} ClassifiedEdge */

/**
 * Extended output type returned by this module.
 * Preserves all fields from DerivedEdge/RawEdge and adds `classification`.
 *
 * @typedef {DerivedEdge & {
 *   kind: "shared" | "perimeter",
 *   classification: "eave" | "ridge" | "hip" | "rake" | "highEdge" | "unknown"
 * }} ClassifiedRoofEdge
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the lower of the two endpoint Y values for an edge.
 *
 * @param {{ start: { y: number }, end: { y: number } }} edge
 * @returns {number}
 */
function getEdgeMinY(edge) {
  return Math.min(edge.start.y, edge.end.y);
}

/**
 * Return the higher of the two endpoint Y values for an edge.
 *
 * @param {{ start: { y: number }, end: { y: number } }} edge
 * @returns {number}
 */
function getEdgeMaxY(edge) {
  return Math.max(edge.start.y, edge.end.y);
}

/**
 * Return true if both endpoints share the same Y coordinate (exact equality).
 * No tolerance is applied at this stage.
 *
 * @param {{ start: { y: number }, end: { y: number } }} edge
 * @returns {boolean}
 */
function isHorizontal(edge) {
  return edge.start.y === edge.end.y;
}

/**
 * Return true if the two endpoints are at different Y coordinates.
 *
 * @param {{ start: { y: number }, end: { y: number } }} edge
 * @returns {boolean}
 */
function isSloped(edge) {
  return edge.start.y !== edge.end.y;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify each edge in the derived edge list.
 *
 * Three-pass algorithm:
 *  Pass 1 — Establish reference elevations from the full edge set.
 *  Pass 2 — Derive secondary flags (hasSharedEdges) from Pass 1 results.
 *  Pass 3 — Assign `classification` to every edge.
 *
 * Classification rules:
 *
 *  Shared edges
 *    "ridge"    : isHorizontal AND minY === maxSharedY
 *    "hip"      : isSloped
 *    "unknown"  : horizontal shared edge not at the peak (future: valley)
 *
 *  Perimeter edges
 *    "eave"     : isHorizontal AND minY === globalMinY
 *    "highEdge" : isHorizontal AND minY > globalMinY AND !hasSharedEdges
 *                 (the elevated horizontal eave of a shed — safe to name
 *                  because a roof with no shared edges cannot have a ridge
 *                  to confuse this with)
 *    "rake"     : isSloped
 *                 (gable end diagonals, shed side edges, hip face boundaries)
 *    "unknown"  : horizontal perimeter edge above minimum on a roof that
 *                 also has shared edges (clerestory / future cases)
 *
 * Expected classification counts:
 *   Gable → 2 eave, 1 ridge, 4 rake  (2 front + 2 rear diagonal perimeter edges)
 *   Shed  → 1 eave, 1 highEdge, 2 rake
 *   Hip   → 4 eave, 1 ridge, 4 hip
 *
 * Note: Gable produces 4 rake edges (not 2) because the quad-face definition
 * in roofTypes/gable.js spans the full building length — each face contributes
 * 2 diagonal perimeter edges (front and rear gable diagonals).  A triangular
 * end-face definition would produce exactly 2, but that is a different model.
 *
 * @param {DerivedEdge[]} edges - Output of deriveEdges()
 * @returns {ClassifiedRoofEdge[]}
 *
 * @example
 * const classified = classifyEdges(derivedEdges);
 */
export function classifyEdges(edges) {
  // -------------------------------------------------------------------------
  // Pass 1 — Collect reference elevations
  // -------------------------------------------------------------------------

  // Lowest Y across all edges → physical eave line.
  // Perimeter horizontal edges at this level are "eave".
  let globalMinY = Infinity;

  // Highest Y among shared edges only → ridge line.
  // Stays -Infinity when the roof has no shared edges (e.g. shed).
  // A horizontal shared edge at exactly this height is "ridge".
  let maxSharedY = -Infinity;

  for (const edge of edges) {
    const minY = getEdgeMinY(edge);
    const maxY = getEdgeMaxY(edge);

    if (minY < globalMinY) globalMinY = minY;

    if (edge.kind === 'shared' && maxY > maxSharedY) {
      maxSharedY = maxY;
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2 — Derive secondary flags
  // -------------------------------------------------------------------------

  // True when at least one shared edge exists.
  // Used to gate the "highEdge" rule: we only apply highEdge on roofs that
  // have NO shared edges (i.e. shed).  On roofs with a ridge, an elevated
  // horizontal perimeter edge is an unusual shape (clerestory, parapet, etc.)
  // and should remain "unknown" until a dedicated rule handles it.
  const hasSharedEdges = maxSharedY !== -Infinity;

  // -------------------------------------------------------------------------
  // Pass 3 — Classify
  // -------------------------------------------------------------------------

  /** @type {ClassifiedRoofEdge[]} */
  const classified = edges.map(edge => {
    let classification = 'unknown';

    if (edge.kind === 'shared') {
      // ------------------------------------------------------------------
      // Ridge: shared + horizontal + at the peak shared elevation.
      //
      //   Gable: the single ridge edge (frontRidge → rearRidge) is horizontal
      //          and both endpoints are at ridgeHeight = maxSharedY. ✓
      //   Hip:   the center ridge segment (ridgeFront → ridgeRear) matches. ✓
      // ------------------------------------------------------------------
      if (isHorizontal(edge) && getEdgeMinY(edge) === maxSharedY) {
        classification = 'ridge';

      // ------------------------------------------------------------------
      // Hip: shared + sloped (endpoints at different elevations).
      //
      //   Hip:   the 4 diagonal edges connecting ridge ends to eave corners
      //          are sloped shared edges. ✓
      //   Gable: has no sloped shared edges — this branch never fires. ✓
      // ------------------------------------------------------------------
      } else if (isSloped(edge)) {
        classification = 'hip';
      }
      // Anything else (horizontal shared edge not at peak) stays "unknown".
      // This slot is reserved for valley edges in a future stage.

    } else if (edge.kind === 'perimeter') {
      // ------------------------------------------------------------------
      // Eave: perimeter + horizontal + at the global minimum elevation.
      //
      //   Gable: the two bottom horizontal edges (left and right). ✓
      //   Hip:   the four bottom eave edges. ✓
      //   Shed:  the single low-side horizontal edge (frontLow → rearLow). ✓
      // ------------------------------------------------------------------
      if (isHorizontal(edge) && getEdgeMinY(edge) === globalMinY) {
        classification = 'eave';

      // ------------------------------------------------------------------
      // HighEdge: perimeter + horizontal + elevated + no shared edges.
      //
      //   Shed:  the high-side horizontal edge (rearHigh → frontHigh) sits
      //          above globalMinY and the roof has no shared edges (no ridge).
      //          This is the exhaust reference for shed ventilation. ✓
      //
      //   Gable/Hip: have shared edges (hasSharedEdges === true) so elevated
      //              horizontal perimeter edges here would hit "unknown" instead.
      //              In practice Gable/Hip don't produce elevated horizontal
      //              perimeter edges with the current face definitions. ✓
      // ------------------------------------------------------------------
      } else if (isHorizontal(edge) && !hasSharedEdges) {
        classification = 'highEdge';

      // ------------------------------------------------------------------
      // Rake: perimeter + sloped.
      //
      //   Gable: 4 diagonal perimeter edges — from each of the 4 eave corners
      //          to the nearest ridge endpoint (2 front, 2 rear). ✓
      //   Shed:  2 side edges connecting the low eave corners to the high eave
      //          corners (rearLow→rearHigh and frontHigh→frontLow). ✓
      //   Hip:   no sloped perimeter edges (all 4 hip diagonals are shared). ✓
      // ------------------------------------------------------------------
      } else if (isSloped(edge)) {
        classification = 'rake';
      }
      // Horizontal perimeter edge above minimum ON a roof with shared edges →
      // remains "unknown" (reserved for clerestory / parapet / future cases).
    }

    return { ...edge, classification };
  });

  return classified;
}

