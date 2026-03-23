/**
 * @fileoverview Shed roof type definition.
 *
 * Produces a minimal valid RoofDefinition for a shed (mono-slope) roof.
 * A shed roof is a single rectangular planar face that slopes from a high eave
 * on one side to a low eave on the other.
 *
 * This file contains NO Three.js, NO mesh building, NO zone logic, and
 * NO placement references.  It is the pure data input to the geometry pipeline.
 *
 * @module roofTypes/shed
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../geometry/types.js').RoofDefinition} RoofDefinition */
/** @typedef {import('../geometry/types.js').RoofFace}       RoofFace       */
/** @typedef {import('../geometry/types.js').Vertex}         Vertex         */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a shed RoofDefinition from common parameters.
 *
 * Coordinate convention (1 unit = 1 foot):
 *   X — building width (low eave → high eave)
 *   Y — height (0 at low eave, riseHeight at high eave)
 *   Z — building length (front → rear)
 *
 * Face layout:
 *   face-main — single sloped surface spanning the full width and length
 *
 * @param {Object} params
 * @param {number} params.width        - Building width in feet (low to high eave)
 * @param {number} params.length       - Building length in feet (front to rear)
 * @param {number} params.pitch        - Roof pitch as rise/run (e.g. 4 = 4:12)
 * @param {number} [params.overhang=0] - Overhang depth in feet
 * @returns {RoofDefinition}
 *
 * @example
 * const def = createShedRoof({ width: 20, length: 40, pitch: 4 });
 */
export function createShedRoof({ width, length, pitch, overhang = 0 }) {
  const riseHeight = (width * pitch) / 12;
  const oh = overhang;

  // Low eave (X = 0 side, Y = 0)
  /** @type {Vertex} */ const frontLow = { x: -oh,        y: 0,          z: -oh         };
  /** @type {Vertex} */ const rearLow  = { x: -oh,        y: 0,          z: length + oh };

  // High eave (X = width side, Y = riseHeight)
  /** @type {Vertex} */ const frontHigh = { x: width + oh, y: riseHeight, z: -oh         };
  /** @type {Vertex} */ const rearHigh  = { x: width + oh, y: riseHeight, z: length + oh };

  /** @type {RoofFace[]} */
  const faces = [
    {
      id: 'face-main',
      // CCW winding when viewed from above/outside
      vertices: [frontLow, rearLow, rearHigh, frontHigh],
    },
  ];

  /** @type {RoofDefinition} */
  return {
    roofType: 'shed',
    faces,
    metadata: { width, length, pitch, overhang },
  };
}
