/*
RoofFlo V2
File: main.js

Purpose:
Application controller that connects all modules.

Responsibilities:
- Initialize scene
- Create geometry
- Handle UI inputs
- Manage simulation state
- Run animation loop

Rules:
- Do not contain geometry logic
- Do not contain vent logic
- Do not contain airflow logic
- Only orchestrate modules

Simulation States:
IDLE
RUNNING
RESET
*/
/*
Dependencies:
- modules/scene.js
- modules/geometry.js
- modules/vents.js
- modules/airflow.js
- modules/calculations.js
*/
/*
State ownership:
- main.js owns app-level UI state and simulation state
- other modules should expose functions and data, not own the whole app state
*/

// Import scene components
import { scene, camera, renderer, controls } from "./modules/scene.js";
import { createAtticGeometry, getGeometryState } from "./modules/geometry.js";
import {
    tryPlaceIntakeVent,
    tryPlaceStaticVent,
    tryPlaceRidgeVent,
    clearAllVents,
    cancelPendingRidgePlacement,
    getVentSummary,
    getPlacedIntakeVents,
    getPlacedStaticVents,
    getPlacedRidgeVents
} from "./modules/vents.js";
import {
    calculateRequiredVentilation,
    calculateInstalledVentilation,
    calculateVentilationStatus
} from "./modules/calculations.js";
import {
    startAirflowSimulation,
    resetAirflowSimulation,
    updateAirflow,
    isSimulationRunning
} from "./modules/airflow.js";

const SimulationState = {
    IDLE: "IDLE",
    RUNNING: "RUNNING",
    RESET: "RESET"
};

const PlacementMode = {
    NONE: "none",
    INTAKE: "intake",
    STATIC: "static",
    RIDGE: "ridge"
};

// UI references
const houseWidthInput = document.getElementById("house-width");
const houseLengthInput = document.getElementById("house-length");
const roofPitchRiseInput = document.getElementById("roof-pitch-rise");
const overhangDepthInput = document.getElementById("overhang-depth");
const ventRuleSelect = document.getElementById("vent-rule");
const intakeVentButton = document.getElementById("btn-intake-vent");
const staticVentButton = document.getElementById("btn-static-vent");
const ridgeVentButton = document.getElementById("btn-ridge-vent");
const startSimulationButton = document.getElementById("btn-start-simulation");
const resetButton = document.getElementById("btn-reset");
const resultAtticArea = document.getElementById("result-attic-area");
const resultRule = document.getElementById("result-rule");
const resultRequiredTotal = document.getElementById("result-required-total");
const resultRequiredIntake = document.getElementById("result-required-intake");
const resultRequiredExhaust = document.getElementById("result-required-exhaust");
const resultInstalledIntake = document.getElementById("result-installed-intake");
const resultInstalledExhaust = document.getElementById("result-installed-exhaust");
const resultIntakeDiff = document.getElementById("result-intake-diff");
const resultExhaustDiff = document.getElementById("result-exhaust-diff");
const resultStatus = document.getElementById("result-status");

const placementButtons = [
    { mode: PlacementMode.INTAKE, button: intakeVentButton },
    { mode: PlacementMode.STATIC, button: staticVentButton },
    { mode: PlacementMode.RIDGE, button: ridgeVentButton }
];

let simulationState = SimulationState.IDLE;
let activePlacementMode = PlacementMode.NONE;

// Store selected ventilation rule for future calculations.
let selectedVentilationRule = ventRuleSelect?.value || "1/150";

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getAirflowVentState() {
    return {
        intakeVents: getPlacedIntakeVents(),
        staticVents: getPlacedStaticVents(),
        ridgeVents: getPlacedRidgeVents()
    };
}

function updateSimulationButtonUI() {
    if (!startSimulationButton) {
        return;
    }

    const running = simulationState === SimulationState.RUNNING;
    startSimulationButton.disabled = running;
    startSimulationButton.textContent = running ? "Simulation Running" : "Start Simulation";
    startSimulationButton.classList.toggle("is-running", running);
}

function formatIn2(value) {
    return `${value.toFixed(1)} in² NFVA`;
}

function formatSqFt(value) {
    return `${value.toFixed(1)} sq ft`;
}

function formatSignedIn2(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)} in² NFVA`;
}

function updateResults() {
    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    const ventilationRule = selectedVentilationRule || "1/150";

    const required = calculateRequiredVentilation({
        buildingWidth,
        buildingLength,
        ventilationRule
    });

    const ventSummary = getVentSummary();
    const installed = calculateInstalledVentilation({
        intakeCount: ventSummary.intakeCount,
        staticCount: ventSummary.staticCount,
        ridgeLengthFeet: ventSummary.ridgeLengthFeet
    });

    const intakeDifference = installed.installedIntakeIn2 - required.requiredIntakeIn2;
    const exhaustDifference = installed.installedExhaustIn2 - required.requiredExhaustIn2;

    const status = calculateVentilationStatus({
        requiredTotal: required.requiredVentIn2,
        requiredIntake: required.requiredIntakeIn2,
        requiredExhaust: required.requiredExhaustIn2,
        installedIntake: installed.installedIntakeIn2,
        installedExhaust: installed.installedExhaustIn2
    });

    if (resultAtticArea) {
        resultAtticArea.textContent = formatSqFt(required.atticAreaSqFt);
    }
    if (resultRule) {
        resultRule.textContent = ventilationRule;
    }
    if (resultRequiredTotal) {
        resultRequiredTotal.textContent = formatIn2(required.requiredVentIn2);
    }
    if (resultRequiredIntake) {
        resultRequiredIntake.textContent = formatIn2(required.requiredIntakeIn2);
    }
    if (resultRequiredExhaust) {
        resultRequiredExhaust.textContent = formatIn2(required.requiredExhaustIn2);
    }
    if (resultInstalledIntake) {
        resultInstalledIntake.textContent = formatIn2(installed.installedIntakeIn2);
    }
    if (resultInstalledExhaust) {
        resultInstalledExhaust.textContent = formatIn2(installed.installedExhaustIn2);
    }
    if (resultIntakeDiff) {
        resultIntakeDiff.textContent = formatSignedIn2(intakeDifference);
    }
    if (resultExhaustDiff) {
        resultExhaustDiff.textContent = formatSignedIn2(exhaustDifference);
    }
    if (resultStatus) {
        resultStatus.textContent = status;
        const isBalanced = status === "Balanced";
        resultStatus.classList.toggle("is-balanced", isBalanced);
        resultStatus.classList.toggle("is-warning", !isBalanced);
    }
}

function rebuildGeometryFromInputs() {
    if (isSimulationRunning()) {
        resetAirflowSimulation();
        simulationState = SimulationState.IDLE;
        activePlacementMode = PlacementMode.NONE;
        updateSimulationButtonUI();
        updatePlacementButtonUI();
    }

    clearAllVents();

    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    const pitchRise = Math.max(1, toNumber(roofPitchRiseInput?.value, 6));
    const overhangDepthInches = Math.max(0, toNumber(overhangDepthInput?.value, 16));
    const overhangDepth = overhangDepthInches / 12;

    createAtticGeometry({
        buildingWidth,
        buildingLength,
        pitchRise,
        overhangDepth
    });
}

function onGeometryInputChanged() {
    rebuildGeometryFromInputs();
    updateResults();
}

function onVentRuleChanged() {
    selectedVentilationRule = ventRuleSelect?.value || "1/150";
    updateResults();
}

function updatePlacementButtonUI() {
    for (const item of placementButtons) {
        if (!item.button) {
            continue;
        }

        const isActive = item.mode === activePlacementMode;
        item.button.classList.toggle("is-active", isActive);
        item.button.setAttribute("aria-pressed", isActive ? "true" : "false");
        item.button.disabled = simulationState === SimulationState.RUNNING;
    }
}

function setPlacementMode(mode) {
    if (simulationState === SimulationState.RUNNING) {
        return;
    }

    cancelPendingRidgePlacement();
    activePlacementMode = activePlacementMode === mode ? PlacementMode.NONE : mode;
    updatePlacementButtonUI();
}

function getPointerNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
}

function onViewerClicked(event) {
    if (simulationState === SimulationState.RUNNING || activePlacementMode === PlacementMode.NONE) {
        return;
    }

    const pointerNdc = getPointerNdc(event);
    if (activePlacementMode === PlacementMode.INTAKE) {
        const placed = tryPlaceIntakeVent(camera, pointerNdc);
        if (placed) {
            updateResults();
        }
        return;
    }

    if (activePlacementMode === PlacementMode.STATIC) {
        const placed = tryPlaceStaticVent(camera, pointerNdc);
        if (placed) {
            updateResults();
        }
        return;
    }

    if (activePlacementMode === PlacementMode.RIDGE) {
        const placed = tryPlaceRidgeVent(camera, pointerNdc);
        if (placed) {
            updateResults();
        }
    }
}

function onStartSimulationClicked() {
    if (simulationState === SimulationState.RUNNING || isSimulationRunning()) {
        return;
    }

    const started = startAirflowSimulation({
        scene,
        getGeometryState,
        getVents: getAirflowVentState
    });
    if (!started) {
        return;
    }

    simulationState = SimulationState.RUNNING;
    activePlacementMode = PlacementMode.NONE;
    cancelPendingRidgePlacement();
    updateSimulationButtonUI();
    updatePlacementButtonUI();
}

function onResetClicked() {
    simulationState = SimulationState.RESET;
    resetAirflowSimulation();
    clearAllVents();
    activePlacementMode = PlacementMode.NONE;

    simulationState = SimulationState.IDLE;
    updateSimulationButtonUI();
    updatePlacementButtonUI();
    updateResults();
}

// Build default geometry on load.
rebuildGeometryFromInputs();
updateResults();

houseWidthInput?.addEventListener("input", onGeometryInputChanged);
houseLengthInput?.addEventListener("input", onGeometryInputChanged);
roofPitchRiseInput?.addEventListener("input", onGeometryInputChanged);
overhangDepthInput?.addEventListener("input", onGeometryInputChanged);
ventRuleSelect?.addEventListener("change", onVentRuleChanged);
intakeVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.INTAKE));
staticVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.STATIC));
ridgeVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.RIDGE));
startSimulationButton?.addEventListener("click", onStartSimulationClicked);
resetButton?.addEventListener("click", onResetClicked);
renderer.domElement.addEventListener("pointerdown", onViewerClicked);

updateSimulationButtonUI();
updatePlacementButtonUI();

let lastAnimationTime = performance.now();

function animate(now = performance.now()) {
    requestAnimationFrame(animate);
    const deltaTime = Math.min((now - lastAnimationTime) / 1000, 0.05);
    lastAnimationTime = now;

    updateAirflow(deltaTime);
    controls.update();
    renderer.render(scene, camera);
}

animate();

export { selectedVentilationRule };

