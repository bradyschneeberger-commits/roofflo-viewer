/**
 * @fileoverview Adapter: canonical pipeline output → Three.js renderable objects.
 *
 * This file is a pure translation layer. It imports Three.js and converts the
 * data shapes produced by buildAttic() + buildMesh() into scene-ready objects.
 *
 * It does NOT import or call any pipeline modules (buildMesh, classifyEdges, etc.).
 * All logic lives in the pipeline; this file only maps data to Three.js primitives.
 */

import * as THREE from 'three';

/** Colors keyed by ClassifiedEdge.classification */
const EDGE_COLORS = {
  ridge:    0xff2222, // red
  eave:     0x2277ff, // blue
  hip:      0xff8800, // orange
  rake:     0x22cc44, // green
  highEdge: 0xaa44ff, // purple
  unknown:  0x888888, // gray
};

/**
 * Build a BufferGeometry from flat mesh arrays produced by buildMesh().
 *
 * @param {{ vertices: number[], indices: number[], normals: number[] }} meshData
 * @returns {THREE.BufferGeometry}
 */
function buildBufferGeometry(meshData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertices, 3));
  geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(meshData.normals,   3));
  geometry.setIndex(meshData.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Build one THREE.Line for a single ClassifiedEdge, colored by its classification.
 *
 * @param {{ start: {x:number,y:number,z:number}, end: {x:number,y:number,z:number}, classification: string }} edge
 * @returns {THREE.Line}
 */
function buildEdgeLine(edge) {
  const color = EDGE_COLORS[edge.classification] ?? EDGE_COLORS.unknown;

  const points = [
    new THREE.Vector3(edge.start.x, edge.start.y, edge.start.z),
    new THREE.Vector3(edge.end.x,   edge.end.y,   edge.end.z),
  ];

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color });

  return new THREE.Line(geometry, material);
}

/**
 * Convert canonical pipeline output into a Three.js debug scene object.
 *
 * @param {{
 *   meshData: { vertices: number[], indices: number[], normals: number[], faceRanges: any[] },
 *   classifiedEdges: import('../types.js').ClassifiedEdge[]
 * }} params
 * @returns {{
 *   group: THREE.Group,
 *   mesh: THREE.Mesh,
 *   edgeLines: THREE.Line[]
 * }}
 */
export function createThreeDebugObject({ meshData, classifiedEdges }) {
  // --- A. Surface mesh ---
  const geometry = buildBufferGeometry(meshData);

  const material = new THREE.MeshStandardMaterial({
    color:     0x7b9eb5,
    metalness: 0.05,
    roughness: 0.80,
    side:      THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // --- B. Classified edge lines ---
  const edgeLines = classifiedEdges.map(buildEdgeLine);

  // --- C. Compose group ---
  const group = new THREE.Group();
  group.add(mesh);
  for (const line of edgeLines) {
    group.add(line);
  }

  return { group, mesh, edgeLines };
}
