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

const REFERENCE_LINE_COLOR = 0xffffff;
const RIDGE_LINE_COLOR = 0xffe347;
const INTAKE_ZONE_COLOR = 0x3ea0ff;
const EXHAUST_ZONE_COLOR = 0xff5a36;
const ZONE_OPACITY = 0.2;
const INTAKE_ZONE_DEPTH_FEET = 3;
const EXHAUST_ZONE_DEPTH_FEET = 3;
const STATIC_PLACEMENT_DEPTH_FEET = 1.5;

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

function toVector3(vertex) {
  return new THREE.Vector3(vertex.x, vertex.y, vertex.z);
}

function createReferenceLine(start, end, name, color = REFERENCE_LINE_COLOR) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
  const material = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  line.name = name;
  return line;
}

function computeFaceCenter(face) {
  const center = new THREE.Vector3();
  const count = face?.vertices?.length || 0;
  if (!count) {
    return center;
  }

  for (const vertex of face.vertices) {
    center.add(toVector3(vertex));
  }

  return center.divideScalar(count);
}

function computeFaceNormal(face) {
  if (!face?.vertices || face.vertices.length < 3) {
    return new THREE.Vector3(0, 1, 0);
  }

  const v0 = toVector3(face.vertices[0]);
  const v1 = toVector3(face.vertices[1]);
  const v2 = toVector3(face.vertices[2]);
  const edgeA = v1.sub(v0);
  const edgeB = v2.sub(v0);
  return new THREE.Vector3().crossVectors(edgeA, edgeB).normalize();
}

function buildInsetEdgePoints(edge, face, depthFeet) {
  const outerStart = toVector3(edge.start);
  const outerEnd = toVector3(edge.end);
  const faceCenter = computeFaceCenter(face);

  const startDir = faceCenter.clone().sub(outerStart);
  if (startDir.lengthSq() <= 0.000001) {
    startDir.set(0, -1, 0);
  } else {
    startDir.normalize();
  }

  const endDir = faceCenter.clone().sub(outerEnd);
  if (endDir.lengthSq() <= 0.000001) {
    endDir.set(0, -1, 0);
  } else {
    endDir.normalize();
  }

  return {
    start: outerStart.clone().addScaledVector(startDir, depthFeet),
    end: outerEnd.clone().addScaledVector(endDir, depthFeet),
  };
}

function createZoneMeshFromEdge(edge, face, name, depthFeet, color) {
  const outerStart = toVector3(edge.start);
  const outerEnd = toVector3(edge.end);
  const innerEdge = buildInsetEdgePoints(edge, face, depthFeet);
  const faceNormal = computeFaceNormal(face);
  const zonePoints = [outerStart, outerEnd, innerEdge.end, innerEdge.start];

  const testNormal = new THREE.Vector3()
    .crossVectors(
      zonePoints[1].clone().sub(zonePoints[0]),
      zonePoints[2].clone().sub(zonePoints[0])
    )
    .normalize();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        zonePoints[0].x, zonePoints[0].y, zonePoints[0].z,
        zonePoints[1].x, zonePoints[1].y, zonePoints[1].z,
        zonePoints[2].x, zonePoints[2].y, zonePoints[2].z,
        zonePoints[3].x, zonePoints[3].y, zonePoints[3].z,
      ]),
      3
    )
  );
  geometry.setIndex(testNormal.dot(faceNormal) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: ZONE_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function resolveIntakeKey(edge, roofType, midpoint, bounds) {
  if (roofType === 'shed') {
    return 'low';
  }

  if (roofType === 'gable') {
    return midpoint.x <= bounds.midX ? 'left' : 'right';
  }

  const dx = midpoint.x - bounds.midX;
  const dz = midpoint.z - bounds.midZ;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx < 0 ? 'left' : 'right';
  }

  return dz < 0 ? 'front' : 'rear';
}

function resolveStaticKey(faceId, roofType) {
  if (roofType === 'shed') {
    return 'high';
  }

  if (faceId?.toLowerCase().includes('left')) {
    return 'left';
  }

  if (faceId?.toLowerCase().includes('right')) {
    return 'right';
  }

  return 'static';
}

export function createThreePlacementObjects({ roofDefinition, references }) {
  const roofType = roofDefinition?.roofType ?? 'unknown';
  const faces = Array.isArray(roofDefinition?.faces) ? roofDefinition.faces : [];
  const faceMap = new Map(faces.map((face) => [face.id, face]));
  const metadata = roofDefinition?.metadata ?? {};
  const width = Number(metadata.width) || 0;
  const length = Number(metadata.length) || 0;
  const bounds = {
    midX: width / 2,
    midZ: length / 2,
  };

  const intakeZoneSources = (references?.intake || []).flatMap((edge, index) => {
    const faceIds = Array.isArray(edge.faceIds) ? edge.faceIds : [];
    if (!faceIds.length) {
      return [];
    }

    const faceId = faceIds[0];
    const face = faceMap.get(faceId);
    if (!face) {
      return [];
    }

    const midpoint = {
      x: (edge.start.x + edge.end.x) * 0.5,
      z: (edge.start.z + edge.end.z) * 0.5,
    };
    const key = resolveIntakeKey(edge, roofType, midpoint, bounds);
    const zone = createZoneMeshFromEdge(
      edge,
      face,
      `${key}IntakeZone-${index}`,
      INTAKE_ZONE_DEPTH_FEET,
      INTAKE_ZONE_COLOR
    );

    return [{ key, zone, edge, faceId, index }];
  });

  const intakeTargets = intakeZoneSources
    .filter(({ edge }) => {
      const dx = edge.end.x - edge.start.x;
      const dy = edge.end.y - edge.start.y;
      const dz = edge.end.z - edge.start.z;
      return (dx * dx + dy * dy + dz * dz) > 0.000001;
    })
    .map(({ key, edge, index }) => {
      const line = createReferenceLine(
        toVector3(edge.start),
        toVector3(edge.end),
        `${key}IntakePlacementLine`,
        REFERENCE_LINE_COLOR
      );
      return { key, line, edge, index };
    });

  const intakeZones = intakeZoneSources.map((zoneSource) => ({
    key: zoneSource.key,
    zone: zoneSource.zone,
    edge: zoneSource.edge,
    faceId: zoneSource.faceId,
  }));

  const ridgeEdge = (references?.ridge || [])[0] || null;
  const ridgeLine = ridgeEdge
    ? createReferenceLine(toVector3(ridgeEdge.start), toVector3(ridgeEdge.end), 'ridgeCenterLine', RIDGE_LINE_COLOR)
    : null;

  const staticTargets = [];
  const exhaustZones = [];
  for (const edge of references?.exhaust || []) {
    const faceIds = Array.isArray(edge.faceIds) ? edge.faceIds : [];
    const candidateFaceIds = edge.classification === 'ridge' ? faceIds : faceIds.slice(0, 1);

    for (const faceId of candidateFaceIds) {
      const face = faceMap.get(faceId);
      if (!face) {
        continue;
      }

      const key = resolveStaticKey(faceId, roofType);
      const zone = createZoneMeshFromEdge(
        edge,
        face,
        `${key}ExhaustZone-${edge.id}`,
        EXHAUST_ZONE_DEPTH_FEET,
        EXHAUST_ZONE_COLOR
      );
      exhaustZones.push({ key, zone, edge, faceId });

      const placementEdge = buildInsetEdgePoints(edge, face, STATIC_PLACEMENT_DEPTH_FEET);
      const line = createReferenceLine(
        placementEdge.start,
        placementEdge.end,
        `${key}StaticPlacementLine`,
        RIDGE_LINE_COLOR
      );
      staticTargets.push({ key, line, zone, edge, faceId });
    }
  }

  return {
    intakeTargets,
    intakeZones,
    staticTargets,
    exhaustZones,
    ridgeLine,
  };
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
