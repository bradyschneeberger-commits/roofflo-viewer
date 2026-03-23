/**
 * @fileoverview Pipeline Stage 3 — Build renderable mesh geometry from faces.
 *
 * Takes the faces from a RoofDefinition and converts them into a mesh-ready
 * representation.  This stage remains data-only and returns plain arrays,
 * not engine objects.
 *
 * IMPORTANT: Three.js is NOT imported here.  This file is intentionally
 * framework-agnostic until render integration is added later.
 *
 * @module geometry/pipeline/buildMesh
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').RoofFace} RoofFace */

/**
 * @typedef {Object} FaceRange
 * @property {string} faceId
 * @property {number} vertexStart
 * @property {number} vertexCount
 * @property {number} triangleStart
 * @property {number} triangleCount
 */

/**
 * @typedef {Object} MeshBuildResult
 * @property {number[]} vertices
 * @property {number[]} indices
 * @property {number[]} normals
 * @property {FaceRange[]} faceRanges
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute a face normal from three points using right-hand cross product.
 *
 * For degenerate triangles (zero area), returns the zero vector.
 *
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {{x:number,y:number,z:number}} c
 * @returns {{x:number,y:number,z:number}}
 */
function computeFaceNormal(a, b, c) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;

  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;

  // cross(AB, AC)
  const nx = (aby * acz) - (abz * acy);
  const ny = (abz * acx) - (abx * acz);
  const nz = (abx * acy) - (aby * acx);

  const len = Math.sqrt((nx * nx) + (ny * ny) + (nz * nz));
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return { x: nx / len, y: ny / len, z: nz / len };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a mesh-ready geometry descriptor from roof faces.
 *
 * @param {RoofFace[]} faces - Faces from a RoofDefinition
 * @returns {MeshBuildResult}
 *   Plain mesh arrays and face-local trace metadata:
 *   - vertices: [x,y,z, x,y,z, ...]
 *   - indices: triangle indices into vertices
 *   - normals: [nx,ny,nz, nx,ny,nz, ...] (one face normal duplicated per face vertex)
 *   - faceRanges: mapping from source face to mesh slices
 *
 * @example
 * const meshData = buildMesh(roofDefinition.faces);
 */
export function buildMesh(faces) {
  /** @type {number[]} */
  const vertices = [];
  /** @type {number[]} */
  const indices = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {FaceRange[]} */
  const faceRanges = [];

  // Deterministic processing order: consume faces in given order and process
  // each face independently (no vertex welding in this stage).
  for (const face of faces) {
    const faceVertices = face?.vertices ?? [];

    // Validation rule for this stage: skip invalid faces (< 3 vertices), do not throw.
    if (!Array.isArray(faceVertices) || faceVertices.length < 3) {
      continue;
    }

    const vertexStart = vertices.length / 3;
    const vertexCount = faceVertices.length;
    const triangleStart = indices.length / 3;

    // Flatten face vertices into mesh position buffer.
    for (const v of faceVertices) {
      vertices.push(v.x, v.y, v.z);
    }

    // Compute one face normal and duplicate it across every vertex of this face.
    // Fan triangulation assumes convex faces and uses v0 as the fan root.
    const normal = computeFaceNormal(faceVertices[0], faceVertices[1], faceVertices[2]);
    for (let i = 0; i < vertexCount; i++) {
      normals.push(normal.x, normal.y, normal.z);
    }

    // Fan triangulation: (0,1,2), (0,2,3), ... local to the face,
    // then shifted by vertexStart to index into the global vertex array.
    let triangleCount = 0;
    for (let i = 1; i < vertexCount - 1; i++) {
      indices.push(vertexStart, vertexStart + i, vertexStart + i + 1);
      triangleCount += 1;
    }

    faceRanges.push({
      faceId: face.id,
      vertexStart,
      vertexCount,
      triangleStart,
      triangleCount,
    });
  }

  return {
    vertices,
    indices,
    normals,
    faceRanges,
  };
}
