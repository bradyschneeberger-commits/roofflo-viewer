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

  // Building-top footprint references under the enclosure.
  /** @type {Vertex} */ const frontLowTop  = { x: 0,     y: 0,          z: 0 };
  /** @type {Vertex} */ const rearLowTop   = { x: 0,     y: 0,          z: length };
  /** @type {Vertex} */ const frontHighTop = { x: width, y: riseHeight, z: 0 };
  /** @type {Vertex} */ const rearHighTop  = { x: width, y: riseHeight, z: length };

  /** @type {RoofFace[]} */
  const faces = [
    {
      id: 'face-main',
      // CCW winding when viewed from above/outside
      vertices: [frontLow, rearLow, rearHigh, frontHigh],
    },
  ];

  // Soffit / underside closure at the low-side eave.
  if (oh > 0) {
    faces.push({
      id: 'face-soffit-low',
      // Clockwise when viewed from above -> downward normal.
      vertices: [frontLow, frontLowTop, rearLowTop, rearLow],
    });
  }

  // End-cap enclosure faces at front/rear (building-top to high-edge boundary).
  // Keep these planar: the shed roof remains one continuous quad, while the
  // front/rear closures are split into triangles so no bent quad is introduced.
  if (oh > 0) {
    faces.push(
      {
        id: 'face-endcap-front-lower',
        // Outward normal toward -Z.
        vertices: [frontLow, frontHigh, frontLowTop],
      },
      {
        id: 'face-endcap-front-upper',
        // Outward normal toward -Z.
        vertices: [frontLowTop, frontHigh, frontHighTop],
      },
      {
        id: 'face-endcap-rear-lower',
        // Outward normal toward +Z.
        vertices: [rearLow, rearLowTop, rearHigh],
      },
      {
        id: 'face-endcap-rear-upper',
        // Outward normal toward +Z.
        vertices: [rearLowTop, rearHighTop, rearHigh],
      },
      {
        id: 'face-endcap-high',
        // High-side closure from building top line to roof high-edge boundary.
        vertices: [frontHigh, frontHighTop, rearHighTop, rearHigh],
      },
    );
  }

  /** @type {RoofDefinition} */
  return {
    roofType: 'shed',
    faces,
    metadata: { width, length, pitch, overhang },
  };
}
