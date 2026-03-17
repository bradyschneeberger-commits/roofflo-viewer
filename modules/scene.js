/*
RoofFlo V2
File: scene.js

Purpose:
Creates and manages the Three.js rendering environment.

Responsibilities:
- Create the scene
- Create the camera
- Create the renderer
- Add lighting
- Add OrbitControls
- Add grid and axis helpers
- Handle window resizing

Rules:
- Do NOT create geometry here
- Do NOT handle vents or airflow
- Do NOT handle calculations

Exports:
scene
camera
renderer
controls
*/

// Import Three.js modules
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Create the scene
const scene = new THREE.Scene();

// Create the camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(12, 10, 22);

// Create the renderer
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("viewer"), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Create controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Add lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1); // soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(0, 10, 0);
scene.add(directionalLight);

// Add helpers
const gridHelper = new THREE.GridHelper(50, 50);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Export the scene components
export { scene, camera, renderer, controls };
