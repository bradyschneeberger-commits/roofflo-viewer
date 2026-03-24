import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createGableRoof } from '../modules/roofTypes/gable.js';
import { createShedRoof } from '../modules/roofTypes/shed.js';
import { createHipRoof } from '../modules/roofTypes/hip.js';
import { createThreeDebugObject } from '../modules/geometry/adapters/canonicalToThree.js';
import { buildAttic } from '../modules/geometry/pipeline/buildAttic.js';
import { buildMesh } from '../modules/geometry/pipeline/buildMesh.js';

// Switch this constant to: "shed" | "gable" | "hip"
const TEST_ROOF = 'gable';

const SAMPLE_PARAMS = {
  shed: { width: 20, length: 40, pitch: 4, overhang: 0 },
  gable: { width: 30, length: 50, pitch: 6, overhang: 0 },
  hip: { width: 30, length: 50, pitch: 6, overhang: 0 },
};

const container = document.getElementById('app');
const roofLabel = document.getElementById('roof-label');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101317);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(45, 28, 52);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(15, 4, 20);
controls.enableDamping = true;

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.05);
sun.position.set(30, 40, 20);
scene.add(sun);

// Simple world references for orientation.
const grid = new THREE.GridHelper(120, 24, 0x2f455f, 0x1f2b39);
grid.position.y = -0.02;
scene.add(grid);

const axes = new THREE.AxesHelper(8);
scene.add(axes);

function buildRoofDefinition(testRoof) {
  if (testRoof === 'shed') return createShedRoof(SAMPLE_PARAMS.shed);
  if (testRoof === 'gable') return createGableRoof(SAMPLE_PARAMS.gable);
  if (testRoof === 'hip') return createHipRoof(SAMPLE_PARAMS.hip);
  throw new Error(`Unsupported TEST_ROOF: ${testRoof}`);
}

function mountCanonicalRoof() {
  const roofDefinition = buildRoofDefinition(TEST_ROOF);
  const atticResult = buildAttic(roofDefinition);

  if (!atticResult.isValid) {
    throw new Error(`Canonical pipeline validation failed: ${atticResult.errors.join('; ')}`);
  }

  const meshData = buildMesh(atticResult.faces);
  const { group, mesh, edgeLines } = createThreeDebugObject({
    meshData,
    classifiedEdges: atticResult.classifiedEdges,
  });
  // 🔍 DEBUG HOOK (FULL PIPELINE VISIBILITY)
window.debug = {
  roofDefinition,
  atticResult,
  meshData,
  classifiedEdges: atticResult.classifiedEdges,
  references: atticResult.references,
  zones: atticResult.zones,
  three: {
    group,
    mesh,
    edgeLines
  }
};

  scene.add(group);

  roofLabel.textContent = `TEST_ROOF: ${TEST_ROOF} | faces: ${atticResult.faces.length} | tris: ${meshData.indices.length / 3}`;

  // Helpful debug output in devtools.
  console.log('roofDefinition', roofDefinition);
  console.log('atticResult', atticResult);
  console.log('meshData', meshData);
  console.log('threeDebugObject', { group, mesh, edgeLines });
}

mountCanonicalRoof();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
