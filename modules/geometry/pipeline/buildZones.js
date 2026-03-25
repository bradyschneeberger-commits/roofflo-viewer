/**
 * @fileoverview Pipeline Stage 5 — Build vent zones from placement references.
 *
 * Discretises each reference edge into a list of VentZone objects that describe
 * where individual vents can physically be placed.  Zone spacing, minimum length,
 * and exclusion zones (e.g. corners) will be applied here.
 *
 * No Three.js. No rendering. Pure data transformation.
 *
 * @module geometry/pipeline/buildZones
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').PlacementReferences} PlacementReferences */
/** @typedef {import('../types.js').ZoneMap}             ZoneMap             */
/** @typedef {import('../types.js').VentZone}            VentZone            */

const INTAKE_ZONE_DEPTH_FEET = 3;
const EXHAUST_ZONE_DEPTH_FEET = 3;

/**
 * Extended zone descriptor returned by this stage.
 *
 * These objects are visual descriptors only; they are not placement decisions
 * and not render meshes.
 *
 * @typedef {VentZone & {
 *   sourceEdgeId: string,
 *   zoneType: "intake" | "exhaust" | "ridge",
 *   start: { x: number, y: number, z: number },
 *   end: { x: number, y: number, z: number },
 *   depth: number | null,
 *   metadata?: Record<string, unknown>
 * }} VisualVentZone
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build one visual zone descriptor per reference edge.
 *
 * Important: this is a structural derivation only.
 * - No offsets
 * - No strip geometry
 * - No slope-aligned depth computation
 *
 * @param {Array<{ id: string, start: { x: number, y: number, z: number }, end: { x: number, y: number, z: number }, classification?: string, kind?: string }>} edges
 * @param {"intake" | "exhaust" | "ridge"} zoneType
 * @returns {VisualVentZone[]}
 */
function mapEdgesToZones(edges, zoneType) {
  const depth = zoneType === 'ridge'
    ? null
    : (zoneType === 'intake' ? INTAKE_ZONE_DEPTH_FEET : EXHAUST_ZONE_DEPTH_FEET);

  return edges.map((edge, index) => ({
    id: `${zoneType}-zone-${index}`,
    sourceEdgeId: edge.id,
    zoneType,
    start: { ...edge.start },
    end: { ...edge.end },
    depth,
    metadata: {
      derivedFrom: 'reference-edge',
      placeholderDepth: depth == null,
      depthFeet: depth,
      edgeKind: edge.kind ?? null,
      edgeClassification: edge.classification ?? null,
      zoneRule: zoneType === 'intake'
        ? 'eave-inset-strip'
        : (zoneType === 'exhaust' ? 'high-reference-inset-strip' : 'ridge-line-reference'),
      excludesOverhangArea: zoneType === 'exhaust'
        ? Boolean(edge?.metadata?.excludesOverhangArea)
        : false,
      ...(edge.metadata ?? {}),
    },
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build discretised vent zones from placement references.
 *
 * @param {PlacementReferences} references - Output of buildReferences()
 * @returns {ZoneMap}
 *
 * @example
 * const zones = buildZones(references);
 * // zones.intake  → array of VentZone objects along eave edges
 * // zones.exhaust → array of VentZone objects along ridge edge
 */
export function buildZones(references) {
  // Zones are downstream visual artifacts derived from references.
  // They preserve source-edge relationships but do not define placement logic.
  // One reference edge => one zone descriptor for this phase.

  const intakeZones = mapEdgesToZones(references.intake, 'intake');
  const exhaustZones = mapEdgesToZones(references.exhaust, 'exhaust');
  const ridgeZones = mapEdgesToZones(references.ridge, 'ridge');

  /** @type {ZoneMap} */
  const zones = {
    intake: intakeZones,
    exhaust: exhaustZones,
    ridge: ridgeZones,
  };

  return zones;
}
