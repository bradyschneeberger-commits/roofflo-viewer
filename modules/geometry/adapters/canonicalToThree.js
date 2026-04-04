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

function verticesMatch(a, b, epsilon = 0.0001) {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon
  );
}

function resolveFaceBandFromEdge(edge, face) {
  const faceVertices = Array.isArray(face?.vertices) ? face.vertices : [];
  const vertexCount = faceVertices.length;
  if (vertexCount < 4) {
    return null;
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const current = faceVertices[i];
    const next = faceVertices[(i + 1) % vertexCount];
    const matchesForward = verticesMatch(current, edge.start) && verticesMatch(next, edge.end);
    const matchesReverse = verticesMatch(current, edge.end) && verticesMatch(next, edge.start);

    if (!matchesForward && !matchesReverse) {
      continue;
    }

    const innerStart = toVector3(edge.start);
    const innerEnd = toVector3(edge.end);
    const oppositeA = toVector3(faceVertices[(i + 2) % vertexCount]);
    const oppositeB = toVector3(faceVertices[(i + 3) % vertexCount]);
    const outerStart = matchesForward ? oppositeB : oppositeA;
    const outerEnd = matchesForward ? oppositeA : oppositeB;
    const depthFeet = (
      innerStart.distanceTo(outerStart) +
      innerEnd.distanceTo(outerEnd)
    ) * 0.5;

    return {
      innerStart,
      innerEnd,
      outerStart,
      outerEnd,
      depthFeet,
    };
  }

  return null;
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

function createZoneMeshFromPoints(zonePoints, faceNormal, name, color) {
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

function createZoneMeshFromEdge(edge, face, name, depthFeet, color) {
  const outerStart = toVector3(edge.start);
  const outerEnd = toVector3(edge.end);
  const innerEdge = buildInsetEdgePoints(edge, face, depthFeet);
  const faceNormal = computeFaceNormal(face);
  return createZoneMeshFromPoints(
    [outerStart, outerEnd, innerEdge.end, innerEdge.start],
    faceNormal,
    name,
    color
  );
}

function buildCenteredZoneSnapLineEdge(edge, face, zoneDepthFeet) {
  return buildInsetEdgePoints(edge, face, zoneDepthFeet * 0.5);
}

function buildCenteredBandSnapLine(band, ratio = 0.5) {
  return {
    start: band.innerStart.clone().lerp(band.outerStart, ratio),
    end: band.innerEnd.clone().lerp(band.outerEnd, ratio),
  };
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

function resolveExhaustFaceIds(edge, roofType) {
  const faceIds = Array.isArray(edge?.faceIds) ? edge.faceIds : [];
  if (!faceIds.length) {
    return [];
  }

  const exteriorFaceIds = faceIds.filter((faceId) => {
    const normalized = String(faceId || '').toLowerCase();
    return !normalized.includes('soffit') && !normalized.includes('endcap');
  });

  if (!exteriorFaceIds.length) {
    return [];
  }

  if (edge.classification === 'ridge') {
    return exteriorFaceIds;
  }

  if (roofType === 'hip') {
    return exteriorFaceIds;
  }

  return exteriorFaceIds.slice(0, 1);
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
    const soffitFaceId = faceIds.find((candidateId) => String(candidateId || '').toLowerCase().includes('soffit'));
    if (!soffitFaceId) {
      return [];
    }

    const face = faceMap.get(soffitFaceId);
    const band = face ? resolveFaceBandFromEdge(edge, face) : null;
    if (!face || !band || band.depthFeet <= 0.000001) {
      return [];
    }

    const midpoint = {
      x: (band.innerStart.x + band.innerEnd.x + band.outerStart.x + band.outerEnd.x) * 0.25,
      z: (band.innerStart.z + band.innerEnd.z + band.outerStart.z + band.outerEnd.z) * 0.25,
    };
    const key = resolveIntakeKey(edge, roofType, midpoint, bounds);
    const zoneDepthFeet = band.depthFeet;
    const zone = createZoneMeshFromPoints(
      [band.outerStart, band.outerEnd, band.innerEnd, band.innerStart],
      computeFaceNormal(face),
      `${key}IntakeZone-${index}`,
      INTAKE_ZONE_COLOR
    );
    zone.userData = {
      zoneType: 'intake',
      authoritativeSurfaceType: 'soffit',
      faceId: soffitFaceId,
      edgeType: edge.classification ?? null,
      zoneDepthFeet,
      snapLineOffsetFeet: zoneDepthFeet * 0.5,
    };

    return [{
      key,
      zone,
      edge,
      faceId: soffitFaceId,
      face,
      band,
      index,
      zoneDepthFeet,
      authoritativeSurfaceType: 'soffit',
    }];
  });

  const intakeTargets = intakeZoneSources
    .map(({ key, edge, faceId, index, band, zoneDepthFeet, authoritativeSurfaceType }) => {
      const placementEdge = buildCenteredBandSnapLine(band, 0.5);
      const line = createReferenceLine(
        placementEdge.start,
        placementEdge.end,
        `${key}IntakePlacementLine`,
        REFERENCE_LINE_COLOR
      );
      return {
        key,
        line,
        edge,
        faceId,
        index,
        zoneType: 'intake',
        edgeType: edge.classification,
        zoneDepthFeet,
        snapLineOffsetFeet: zoneDepthFeet * 0.5,
        authoritativeSurfaceType,
      };
    })
    .filter(Boolean);

  const intakeZones = intakeZoneSources.map((zoneSource) => ({
    key: zoneSource.key,
    zone: zoneSource.zone,
    edge: zoneSource.edge,
    faceId: zoneSource.faceId,
    zoneType: 'intake',
    edgeType: zoneSource.edge?.classification || null,
    zoneDepthFeet: zoneSource.zoneDepthFeet,
    authoritativeSurfaceType: zoneSource.authoritativeSurfaceType,
  }));

  const ridgeEdge = (references?.ridge || [])[0] || null;
  const ridgeLine = ridgeEdge
    ? createReferenceLine(toVector3(ridgeEdge.start), toVector3(ridgeEdge.end), 'ridgeCenterLine', RIDGE_LINE_COLOR)
    : null;

  const staticTargets = [];
  const exhaustZones = [];
  for (const edge of references?.exhaust || []) {
    const candidateFaceIds = resolveExhaustFaceIds(edge, roofType);

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
      exhaustZones.push({
        key,
        zone,
        edge,
        faceId,
        zoneType: 'exhaust',
        edgeType: edge.classification,
        zoneDepthFeet: EXHAUST_ZONE_DEPTH_FEET,
      });

      const snapLineOffsetFeet = edge.classification === 'ridge'
        ? EXHAUST_ZONE_DEPTH_FEET * 0.5
        : STATIC_PLACEMENT_DEPTH_FEET;
      const placementEdge = buildInsetEdgePoints(edge, face, snapLineOffsetFeet);
      const line = createReferenceLine(
        placementEdge.start,
        placementEdge.end,
        `${key}StaticPlacementLine`,
        RIDGE_LINE_COLOR
      );
      staticTargets.push({
        key,
        line,
        zone,
        edge,
        faceId,
        zoneType: 'exhaust',
        edgeType: edge.classification,
        zoneDepthFeet: EXHAUST_ZONE_DEPTH_FEET,
        snapLineOffsetFeet,
      });
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
