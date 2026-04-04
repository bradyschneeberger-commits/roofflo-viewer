/**
 * @fileoverview Gable roof type definition.
 *
 * Produces a minimal valid RoofDefinition for a gable roof.
 * A gable roof has two rectangular planar faces that meet at a central ridge.
 *
 * This file contains NO Three.js, NO mesh building, NO zone logic, and
 * NO placement references.  It is the pure data input to the geometry pipeline.
 *
 * @module roofTypes/gable
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
 * Create a gable RoofDefinition from common parameters.
 *
 * Coordinate convention (1 unit = 1 foot):
 *   X — building width (left → right)
 *   Y — height (eave → ridge)
 *   Z — building length (front → rear)
 *
 * Face layout:
 *   face-left  — left slope (X = 0 side)
 *   face-right — right slope (X = width side)
 *
 * @param {Object} params
 * @param {number} params.width        - Building width in feet (eave to eave)
 * @param {number} params.length       - Building length in feet (front to rear)
 * @param {number} params.pitch        - Roof pitch as rise/run (e.g. 6 = 6:12)
 * @param {number} [params.overhang=0] - Overhang depth in feet (extends eave past wall)
 * @returns {RoofDefinition}
 *
 * @example
 * const def = createGableRoof({ width: 30, length: 50, pitch: 6 });
 */
export function createGableRoof({ width, length, pitch, overhang = 0 }) {
  const halfWidth  = width / 2;
  const ridgeHeight = (halfWidth * pitch) / 12;
  const oh = overhang;

  // Eave corners (Y = 0, with overhang pulling Z outward and X outward)
  /** @type {Vertex} */ const frontLeftEave  = { x: -oh,        y: 0, z: -oh     };
  /** @type {Vertex} */ const rearLeftEave   = { x: -oh,        y: 0, z: length + oh };
  /** @type {Vertex} */ const frontRightEave = { x: width + oh, y: 0, z: -oh     };
  /** @type {Vertex} */ const rearRightEave  = { x: width + oh, y: 0, z: length + oh };

  // Ridge points (Y = ridgeHeight, X = halfWidth, no overhang in X)
  /** @type {Vertex} */ const frontRidge = { x: halfWidth, y: ridgeHeight, z: -oh     };
  /** @type {Vertex} */ const rearRidge  = { x: halfWidth, y: ridgeHeight, z: length + oh };

  // Building-top footprint references (wall top boundary under roof enclosure)
  /** @type {Vertex} */ const frontLeftTop  = { x: 0,     y: 0, z: 0 };
  /** @type {Vertex} */ const rearLeftTop   = { x: 0,     y: 0, z: length };
  /** @type {Vertex} */ const frontRightTop = { x: width, y: 0, z: 0 };
  /** @type {Vertex} */ const rearRightTop  = { x: width, y: 0, z: length };

  /** @type {Vertex} */ const frontRidgeTop = { x: halfWidth, y: ridgeHeight, z: 0 };
  /** @type {Vertex} */ const rearRidgeTop  = { x: halfWidth, y: ridgeHeight, z: length };

  /** @type {RoofFace[]} */
  const faces = [
    {
      id: 'face-left',
      // CCW winding when viewed from outside (left side)
      vertices: [frontLeftEave, rearLeftEave, rearRidge, frontRidge],
    },
    {
      id: 'face-right',
      // CCW winding when viewed from outside (right side)
      vertices: [frontRightEave, frontRidge, rearRidge, rearRightEave],
    },
  ];

  // Soffit / underside faces derived from eave edges.
  // These are horizontal closure strips between roof eaves and building footprint.
  if (oh > 0) {
    faces.push(
      {
        id: 'face-soffit-left',
        // Clockwise when viewed from above -> downward normal.
        vertices: [frontLeftEave, frontLeftTop, rearLeftTop, rearLeftEave],
      },
      {
        id: 'face-soffit-right',
        // Clockwise when viewed from above -> downward normal.
        vertices: [rearRightEave, rearRightTop, frontRightTop, frontRightEave],
      },
    );
  }

  // End-cap enclosure faces at front/rear gable ends (building-top to ridge).
  faces.push(
    {
      id: 'face-endcap-front',
      // Outward normal toward -Z.
      vertices: [frontLeftTop, frontRidgeTop, frontRightTop],
    },
    {
      id: 'face-endcap-rear',
      // Outward normal toward +Z.
      vertices: [rearLeftTop, rearRightTop, rearRidgeTop],
    },
  );

  /** @type {RoofDefinition} */
  return {
    roofType: 'gable',
    faces,
    metadata: { width, length, pitch, overhang },
  };
}
