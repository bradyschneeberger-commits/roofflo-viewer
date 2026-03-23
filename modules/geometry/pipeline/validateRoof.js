/**
 * @fileoverview Roof validation — ensure RoofFace data is well-formed before pipeline entry.
 *
 * Called at the top of buildAttic() (or any entry point) to catch bad input early
 * and produce clear, actionable error messages.
 *
 * No Three.js. No rendering. Pure validation logic.
 *
 * @module geometry/pipeline/validateRoof
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — see types.js)
// ---------------------------------------------------------------------------

/** @typedef {import('../types.js').RoofFace} RoofFace */
/** @typedef {{ isValid: boolean, errors: string[] }} ValidationResult */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true if two vertices occupy the same position (within floating-point epsilon).
 *
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 * @param {number} [epsilon=1e-6]
 * @returns {boolean}
 */
function verticesEqual(a, b, epsilon = 1e-6) {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.z - b.z) < epsilon
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an array of RoofFace objects.
 *
 * Rules enforced:
 *  1. At least one face must exist.
 *  2. Each face must have a non-empty string `id`.
 *  3. Each face must have 3 or more vertices.
 *  4. No two adjacent vertices within a face may be identical (degenerate edge).
 *
 * @param {RoofFace[]} faces
 * @returns {ValidationResult}
 *
 * @example
 * const { isValid, errors } = validateFaces(roofDefinition.faces);
 * if (!isValid) console.error(errors);
 */
export function validateFaces(faces) {
  /** @type {string[]} */
  const errors = [];

  // Rule 1 — at least one face
  if (!Array.isArray(faces) || faces.length === 0) {
    errors.push('RoofDefinition must contain at least one face.');
    return { isValid: false, errors };
  }

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const label = `Face[${i}] (id: "${face?.id ?? 'undefined'}")`;

    // Rule 2 — id must be a non-empty string
    if (typeof face.id !== 'string' || face.id.trim() === '') {
      errors.push(`${label}: id must be a non-empty string.`);
    }

    // Rule 3 — at least 3 vertices
    if (!Array.isArray(face.vertices) || face.vertices.length < 3) {
      errors.push(`${label}: must have at least 3 vertices (got ${face?.vertices?.length ?? 0}).`);
      continue; // skip vertex-pair check — not enough data
    }

    // Rule 4 — no identical adjacent vertices
    const verts = face.vertices;
    for (let j = 0; j < verts.length; j++) {
      const next = (j + 1) % verts.length;
      if (verticesEqual(verts[j], verts[next])) {
        errors.push(
          `${label}: vertices[${j}] and vertices[${next}] are identical — degenerate edge.`
        );
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
