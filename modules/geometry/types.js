/**
 * @fileoverview Canonical data structure definitions for the RoofFlo geometry pipeline.
 *
 * These types describe the contract that flows through each pipeline stage:
 *   RoofDefinition → DerivedEdge[] → ClassifiedEdge[] → PlacementReferences → ZoneMap → AtticResult
 *
 * No Three.js. No rendering. Pure data.
 */

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Vertex
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

// ---------------------------------------------------------------------------
// RoofFace
// ---------------------------------------------------------------------------

/**
 * A single planar face of a roof surface.
 *
 * @typedef {Object} RoofFace
 * @property {string}   id       - Unique face identifier (e.g. "face-left", "face-front")
 * @property {Vertex[]} vertices - Ordered CCW vertices (3 or more). 1 unit = 1 foot.
 */

// ---------------------------------------------------------------------------
// RoofDefinition
// ---------------------------------------------------------------------------

/**
 * The top-level input to the geometry pipeline.
 * Each roof type module (gable.js, shed.js, hip.js) produces one of these.
 *
 * @typedef {Object} RoofDefinition
 * @property {string}    roofType - "gable" | "shed" | "hip"
 * @property {RoofFace[]} faces   - All surface faces for this roof
 * @property {Object}    [metadata] - Optional free-form metadata (pitch, overhang, etc.)
 */

// ---------------------------------------------------------------------------
// DerivedEdge
// ---------------------------------------------------------------------------

/**
 * An edge derived from the face definitions.
 * Shared edges (two faceIds) are ridge/hip/valley candidates.
 * Perimeter edges (one faceId) are eave/gable candidates.
 *
 * @typedef {Object} DerivedEdge
 * @property {string}   id      - Unique edge identifier (e.g. "edge-0-1")
 * @property {Vertex}   start
 * @property {Vertex}   end
 * @property {string[]} faceIds - Face IDs that share this edge (1 = perimeter, 2 = shared)
 * @property {string}   [kind]  - Set by classifyEdges: "eave" | "ridge" | "hip" | "valley" | "gable" | "unknown"
 */

// ---------------------------------------------------------------------------
// ClassifiedEdge  (DerivedEdge with kind guaranteed)
// ---------------------------------------------------------------------------

/**
 * @typedef {DerivedEdge & { kind: string }} ClassifiedEdge
 */

// ---------------------------------------------------------------------------
// PlacementReferences
// ---------------------------------------------------------------------------

/**
 * Edges grouped by their ventilation role.
 * Produced by buildReferences from the classified edge list.
 *
 * @typedef {Object} PlacementReferences
 * @property {ClassifiedEdge[]} intake  - Edges suitable for intake vent placement (eaves)
 * @property {ClassifiedEdge[]} exhaust - Edges suitable for exhaust vent placement (ridge)
 * @property {ClassifiedEdge[]} ridge   - All ridge edges (may overlap with exhaust)
 */

// ---------------------------------------------------------------------------
// ZoneMap
// ---------------------------------------------------------------------------

/**
 * Discretised placement zones derived from PlacementReferences.
 * Each zone describes a segment of an edge where a vent can be placed.
 *
 * @typedef {Object} VentZone
 * @property {string}  id        - Unique zone identifier
 * @property {string}  edgeId    - Source edge ID
 * @property {string}  role      - "intake" | "exhaust" | "ridge"
 * @property {Vertex}  center    - World-space center point of the zone
 * @property {number}  length    - Length of the zone in feet
 */

/**
 * @typedef {Object} ZoneMap
 * @property {VentZone[]} intake
 * @property {VentZone[]} exhaust
 * @property {VentZone[]} ridge
 */

// ---------------------------------------------------------------------------
// AtticResult
// ---------------------------------------------------------------------------

/**
 * Final output of the geometry pipeline.
 * Contains everything needed to render and simulate a roof.
 *
 * @typedef {Object} AtticResult
 * @property {RoofDefinition}      roofDefinition
 * @property {ClassifiedEdge[]}    edges
 * @property {PlacementReferences} references
 * @property {ZoneMap}             zones
 * @property {Object}              [mesh]   - Populated by buildMesh (Three.js BufferGeometry etc.)
 * @property {Object}              [metadata]
 */

// This file is documentation only — no runtime exports needed.
// Import jsdoc types via /** @type {import('./types.js').RoofDefinition} */ in consumers.
