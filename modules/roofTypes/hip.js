/**
 * @fileoverview Hip roof type definition.
 *
 * Produces a minimal valid RoofDefinition for a hip roof.
 * A hip roof has four triangular/trapezoidal faces that all slope downward
 * from a central ridge to each eave edge.
 *
 * Face layout for a rectangular building (width < length):
 *   face-left   — trapezoidal slope on the long left side
 *   face-right  — trapezoidal slope on the long right side
 *   face-front  — triangular hip face on the short front end
 *   face-rear   — triangular hip face on the short rear end
 *
 * This file contains NO Three.js, NO mesh building, NO zone logic, and
 * NO placement references.  It is the pure data input to the geometry pipeline.
 *
 * @module roofTypes/hip
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
 * Create a hip RoofDefinition from common parameters.
 *
 * Coordinate convention (1 unit = 1 foot):
 *   X — building width (left eave → right eave)
 *   Y — height (0 at eave, ridgeHeight at ridge)
 *   Z — building length (front eave → rear eave)
 *
 * The hip run equals halfWidth (same pitch on all four sides).
 *
 * @param {Object} params
 * @param {number} params.width        - Building width in feet
 * @param {number} params.length       - Building length in feet (must be >= width)
 * @param {number} params.pitch        - Roof pitch as rise/run (e.g. 6 = 6:12)
 * @param {number} [params.overhang=0] - Overhang depth in feet
 * @returns {RoofDefinition}
 *
 * @example
 * const def = createHipRoof({ width: 30, length: 50, pitch: 6 });
 */
export function createHipRoof({ width, length, pitch, overhang = 0 }) {
  const halfWidth  = width / 2;
  const ridgeHeight = (halfWidth * pitch) / 12;
  const oh = overhang;

  // Eave corners (Y = 0)
  /** @type {Vertex} */ const frontLeft  = { x: -oh,        y: 0, z: -oh         };
  /** @type {Vertex} */ const rearLeft   = { x: -oh,        y: 0, z: length + oh };
  /** @type {Vertex} */ const frontRight = { x: width + oh, y: 0, z: -oh         };
  /** @type {Vertex} */ const rearRight  = { x: width + oh, y: 0, z: length + oh };

  // Ridge endpoints (Y = ridgeHeight)
  // Ridge starts halfWidth in from each end (hip run = halfWidth)
  /** @type {Vertex} */ const ridgeFront = { x: halfWidth, y: ridgeHeight, z: halfWidth     };
  /** @type {Vertex} */ const ridgeRear  = { x: halfWidth, y: ridgeHeight, z: length - halfWidth };

  // Building-top footprint references under eave overhangs.
  /** @type {Vertex} */ const frontLeftTop  = { x: 0,     y: 0, z: 0 };
  /** @type {Vertex} */ const rearLeftTop   = { x: 0,     y: 0, z: length };
  /** @type {Vertex} */ const frontRightTop = { x: width, y: 0, z: 0 };
  /** @type {Vertex} */ const rearRightTop  = { x: width, y: 0, z: length };

  /** @type {RoofFace[]} */
  const faces = [
    {
      id: 'face-left',
      // Trapezoidal left slope: front-left eave → rear-left eave → ridge-rear → ridge-front
      vertices: [frontLeft, rearLeft, ridgeRear, ridgeFront],
    },
    {
      id: 'face-right',
      // Trapezoidal right slope: front-right eave → ridge-front → ridge-rear → rear-right eave
      vertices: [frontRight, ridgeFront, ridgeRear, rearRight],
    },
    {
      id: 'face-front',
      // Triangular front hip: front-left → front-right → ridge-front
      vertices: [frontLeft, frontRight, ridgeFront],
    },
    {
      id: 'face-rear',
      // Triangular rear hip: rear-right → rear-left → ridge-rear
      vertices: [rearRight, rearLeft, ridgeRear],
    },
  ];

  // Soffit / underside faces for each eave edge (left, right, front, rear).
  if (oh > 0) {
    faces.push(
      {
        id: 'face-soffit-left',
        // Clockwise when viewed from above -> downward normal.
        vertices: [frontLeft, frontLeftTop, rearLeftTop, rearLeft],
      },
      {
        id: 'face-soffit-right',
        // Clockwise when viewed from above -> downward normal.
        vertices: [rearRight, rearRightTop, frontRightTop, frontRight],
      },
      {
        id: 'face-soffit-front',
        // Clockwise when viewed from above -> downward normal.
        vertices: [frontLeft, frontRight, frontRightTop, frontLeftTop],
      },
      {
        id: 'face-soffit-rear',
        // Clockwise when viewed from above -> downward normal.
        vertices: [rearRight, rearLeft, rearLeftTop, rearRightTop],
      },
    );
  }

  /** @type {RoofDefinition} */
  return {
    roofType: 'hip',
    faces,
    metadata: { width, length, pitch, overhang },
  };
}
