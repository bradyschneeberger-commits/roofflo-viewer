import { scene, camera, renderer, controls, gridHelper } from "./modules/scene.js";
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
    getPlacedRidgeVents,
    initializeVentPreview,
    updateVentPreview,
    hideVentPreview,
    clearVentPreview,
    exportCurrentVentLayout,
    restoreVentLayout,
    generateIntakeOnlyPreset,
    generateExhaustOnlyPreset,
    generateBalancedPreset,
    hasStaticVentConflict
} from "./modules/vents.js";
import {
    calculateAtticArea,
    calculateRequiredVentilation,
    calculateRequiredIntake,
    calculateRequiredExhaust,
    calculateInstalledVentilation,
    calculateVentilationStatus,
    formatVentilationValue
} from "./modules/calculations.js";
import {
    initializeAirflowVisualization,
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
const controlPanel = document.getElementById("control-panel");
const resultsPanel = document.getElementById("results-panel");
const controlsToggleButton = document.getElementById("controls-toggle");
const resultsToggleButton = document.getElementById("results-toggle");
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
const ventStatusToast = document.getElementById("vent-status-toast");
const ventStatusMessage = document.getElementById("vent-status-message");
const ventStatusCloseButton = document.getElementById("vent-status-close");
const toolbarSaveCurrentButton = document.getElementById("btn-toolbar-save-current");
const toolbarRestoreCurrentButton = document.getElementById("btn-toolbar-restore-current");
const toolbarIntakeOnlyButton = document.getElementById("btn-toolbar-intake-only");
const toolbarExhaustOnlyButton = document.getElementById("btn-toolbar-exhaust-only");
const toolbarBalancedButton = document.getElementById("btn-toolbar-balanced");
const toolbarGridToggleButton = document.getElementById("btn-toolbar-grid-toggle");
const toolbarStartButton = document.getElementById("btn-toolbar-start");
const toolbarResetButton = document.getElementById("btn-toolbar-reset");

const placementButtons = [
    { mode: PlacementMode.INTAKE, button: intakeVentButton },
    { mode: PlacementMode.STATIC, button: staticVentButton },
    { mode: PlacementMode.RIDGE, button: ridgeVentButton }
];

let simulationState = SimulationState.IDLE;
let activePlacementMode = PlacementMode.NONE;
let mobileUiState = {
    controlsOpen: false,
    resultsOpen: false
};
let userDismissedVentMessage = false;
let lastVentStatusKey = null;
let savedVentLayout = null;
let transientStatusTimer = null;
let isGridVisible = true;

// Store selected ventilation rule for future calculations.
let selectedVentilationRule = ventRuleSelect?.value || "1/150";

// Tap-vs-drag tracking for mobile-safe placement
let pointerDownInfo = null;
const TAP_MOVE_THRESHOLD = 10;

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
    const running = simulationState === SimulationState.RUNNING;

    if (toolbarStartButton) {
        toolbarStartButton.disabled = running;
        toolbarStartButton.textContent = running ? "Simulation Running" : "Start Simulation";
    }
}

function syncGridVisibilityUI() {
    gridHelper.visible = isGridVisible;

    if (!toolbarGridToggleButton) {
        return;
    }

    toolbarGridToggleButton.textContent = isGridVisible ? "Hide" : "Show";
    toolbarGridToggleButton.setAttribute("aria-label", isGridVisible ? "Hide grid" : "Show grid");
}

function onGridToggleClicked() {
    isGridVisible = !isGridVisible;
    syncGridVisibilityUI();
}

function isMobilePanelMode() {
    return window.matchMedia("(max-width: 768px)").matches;
}

function updatePanelToggleUI() {
    if (!controlPanel || !resultsPanel || !controlsToggleButton || !resultsToggleButton) {
        return;
    }

    const mobileMode = isMobilePanelMode();
    const controlsOpen = mobileMode ? mobileUiState.controlsOpen : true;
    const resultsOpen = mobileMode ? mobileUiState.resultsOpen : true;

    controlPanel.classList.toggle("is-open", controlsOpen);
    resultsPanel.classList.toggle("is-open", resultsOpen);

    controlsToggleButton.setAttribute("aria-expanded", controlsOpen ? "true" : "false");
    resultsToggleButton.setAttribute("aria-expanded", resultsOpen ? "true" : "false");
}

function openControlsPanel() {
    if (!isMobilePanelMode()) {
        return;
    }

    mobileUiState.controlsOpen = true;
    mobileUiState.resultsOpen = false;
    updatePanelToggleUI();
}

function openResultsPanel() {
    if (!isMobilePanelMode()) {
        return;
    }

    mobileUiState.controlsOpen = false;
    mobileUiState.resultsOpen = true;
    updatePanelToggleUI();
}

function closeAllPanels() {
    if (!isMobilePanelMode()) {
        return;
    }

    mobileUiState.controlsOpen = false;
    mobileUiState.resultsOpen = false;
    updatePanelToggleUI();
}

function toggleControlsPanel() {
    if (!isMobilePanelMode()) {
        return;
    }

    if (mobileUiState.controlsOpen) {
        closeAllPanels();
        return;
    }

    openControlsPanel();
}

function toggleResultsPanel() {
    if (!isMobilePanelMode()) {
        return;
    }

    if (mobileUiState.resultsOpen) {
        closeAllPanels();
        return;
    }

    openResultsPanel();
}

function syncResponsiveUiState() {
    if (isMobilePanelMode()) {
        if (!mobileUiState.controlsOpen && !mobileUiState.resultsOpen) {
            mobileUiState.controlsOpen = true;
            mobileUiState.resultsOpen = false;
        }
    } else {
        mobileUiState.controlsOpen = false;
        mobileUiState.resultsOpen = false;
    }

    updatePanelToggleUI();
}

function formatSqFt(value) {
    return `${value.toFixed(1)} sq ft`;
}

function formatSignedIn2(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)} in² NFVA`;
}

function getCurrentVentilationStatus() {
    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    const ventilationRule = selectedVentilationRule || "1/150";
    const atticAreaSqFt = calculateAtticArea(buildingWidth, buildingLength);
    const requiredVentIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
    const requiredIntakeIn2 = calculateRequiredIntake(requiredVentIn2);
    const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentIn2);

    const ventSummary = getVentSummary();
    const installed = calculateInstalledVentilation({
        intakeCount: ventSummary.intakeCount,
        staticCount: ventSummary.staticCount,
        ridgeLengthFeet: ventSummary.ridgeLengthFeet
    });

    return calculateVentilationStatus({
        requiredTotal: requiredVentIn2,
        requiredIntake: requiredIntakeIn2,
        requiredExhaust: requiredExhaustIn2,
        installedIntake: installed.installedIntakeIn2,
        installedExhaust: installed.installedExhaustIn2
    });
}

function getVentilationState() {
    const hasIntake = getPlacedIntakeVents().length > 0;
    const hasExhaust =
        getPlacedStaticVents().length > 0 ||
        getPlacedRidgeVents().length > 0;

    if (!hasIntake && !hasExhaust) {
        return "none";
    }

    if (hasIntake && !hasExhaust) {
        return "intake";
    }

    if (!hasIntake && hasExhaust) {
        return "exhaust";
    }

    return "balanced";
}

function getVentilationMessageData() {
    if (hasStaticVentConflict()) {
        return {
            message: "More exhaust is not always better - vents on both sides can compete and reduce proper airflow",
            state: "warning",
            key: "conflict:static-both-slopes"
        };
    }

    const ventilationState = getVentilationState();

    if (ventilationState === "none") {
        return {
            message: "Hot, stale air is trapped in the attic",
            state: "danger",
            key: "none:danger"
        };
    }

    if (ventilationState === "intake") {
        return {
            message: "Air is entering, but has nowhere to escape",
            state: "warning",
            key: "intake:warning"
        };
    }

    if (ventilationState === "exhaust") {
        return {
            message: "Air is escaping, but no fresh air is replacing it",
            state: "warning",
            key: "exhaust:warning"
        };
    }

    const ventilationStatus = getCurrentVentilationStatus();

    if (ventilationStatus === "Balanced") {
        return {
            message: "Proper airflow established - air is entering and exiting efficiently",
            state: "success",
            key: `balanced:${ventilationStatus}`
        };
    }

    return {
        message: "Air is moving through the attic, but the system is not yet balanced",
        state: "info",
        key: `balanced:${ventilationStatus}`
    };
}

function updateVentStatusMessage({ forceReveal = false } = {}) {
    const messageData = getVentilationMessageData();
    const stateChanged = messageData.key !== lastVentStatusKey;

    if (stateChanged || forceReveal) {
        userDismissedVentMessage = false;
    }

    if (ventStatusMessage) {
        ventStatusMessage.textContent = messageData.message;
    }

    if (ventStatusToast) {
        ventStatusToast.classList.remove("is-danger", "is-warning", "is-info", "is-success");
        ventStatusToast.classList.add(`is-${messageData.state}`);

        const shouldShow = !userDismissedVentMessage;
        ventStatusToast.classList.toggle("is-visible", shouldShow);
        ventStatusToast.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }

    lastVentStatusKey = messageData.key;
}

function dismissVentStatusMessage() {
    userDismissedVentMessage = true;

    if (!ventStatusToast) {
        return;
    }

    ventStatusToast.classList.remove("is-visible");
    ventStatusToast.setAttribute("aria-hidden", "true");
}

function setRestoreAvailabilityUI() {
    if (!toolbarRestoreCurrentButton) {
        return;
    }

    toolbarRestoreCurrentButton.disabled = !savedVentLayout;

    if (toolbarSaveCurrentButton) {
        toolbarSaveCurrentButton.classList.toggle("is-saved", Boolean(savedVentLayout));
    }
}

function showTemporaryStatusMessage(message, state = "info", durationMs = 1400) {
    if (!ventStatusToast || !ventStatusMessage) {
        return;
    }

    if (transientStatusTimer) {
        window.clearTimeout(transientStatusTimer);
        transientStatusTimer = null;
    }

    userDismissedVentMessage = false;
    ventStatusMessage.textContent = message;
    ventStatusToast.classList.remove("is-danger", "is-warning", "is-info", "is-success");
    ventStatusToast.classList.add(`is-${state}`);
    ventStatusToast.classList.add("is-visible");
    ventStatusToast.setAttribute("aria-hidden", "false");

    transientStatusTimer = window.setTimeout(() => {
        transientStatusTimer = null;
        updateVentStatusMessage({ forceReveal: true });
    }, durationMs);
}

function refreshResultsPanel() {
    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    const ventilationRule = selectedVentilationRule || "1/150";

    const atticAreaSqFt = calculateAtticArea(buildingWidth, buildingLength);
    const requiredVentIn2 = calculateRequiredVentilation(atticAreaSqFt, ventilationRule);
    const requiredIntakeIn2 = calculateRequiredIntake(requiredVentIn2);
    const requiredExhaustIn2 = calculateRequiredExhaust(requiredVentIn2);

    const ventSummary = getVentSummary();
    const installed = calculateInstalledVentilation({
        intakeCount: ventSummary.intakeCount,
        staticCount: ventSummary.staticCount,
        ridgeLengthFeet: ventSummary.ridgeLengthFeet
    });

    const intakeDifference = installed.installedIntakeIn2 - requiredIntakeIn2;
    const exhaustDifference = installed.installedExhaustIn2 - requiredExhaustIn2;

    const status = calculateVentilationStatus({
        requiredTotal: requiredVentIn2,
        requiredIntake: requiredIntakeIn2,
        requiredExhaust: requiredExhaustIn2,
        installedIntake: installed.installedIntakeIn2,
        installedExhaust: installed.installedExhaustIn2
    });

    if (resultAtticArea) {
        resultAtticArea.textContent = formatSqFt(atticAreaSqFt);
    }
    if (resultRule) {
        resultRule.textContent = ventilationRule;
    }
    if (resultRequiredTotal) {
        resultRequiredTotal.textContent = formatVentilationValue(requiredVentIn2);
    }
    if (resultRequiredIntake) {
        resultRequiredIntake.textContent = formatVentilationValue(requiredIntakeIn2);
    }
    if (resultRequiredExhaust) {
        resultRequiredExhaust.textContent = formatVentilationValue(requiredExhaustIn2);
    }
    if (resultInstalledIntake) {
        resultInstalledIntake.textContent = formatVentilationValue(installed.installedIntakeIn2);
    }
    if (resultInstalledExhaust) {
        resultInstalledExhaust.textContent = formatVentilationValue(installed.installedExhaustIn2);
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

    // Rebuild should also refresh always-visible trapped air visualization.
    resetAirflowSimulation();

    clearAllVents();
    clearVentPreview();

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

    initializeAirflowVisualization({
        scene,
        getGeometryState,
        getVents: getAirflowVentState
    });

    initializeVentPreview();
}

function onGeometryInputChanged() {
    rebuildGeometryFromInputs();
    refreshResultsPanel();
    updateVentStatusMessage();
}

function onVentRuleChanged() {
    selectedVentilationRule = ventRuleSelect?.value || "1/150";
    refreshResultsPanel();
    updateVentStatusMessage();
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

    const viewer = renderer.domElement;
    const isPlacementActive =
        activePlacementMode !== PlacementMode.NONE &&
        simulationState !== SimulationState.RUNNING;

    viewer.classList.toggle("placement-active", isPlacementActive);

    // Keep camera controls available even while a placement mode is active.
    // Tap-vs-drag detection below prevents accidental placement during orbit.
    controls.enabled = true;
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

    const clientX =
        event.clientX ??
        event.changedTouches?.[0]?.clientX ??
        event.touches?.[0]?.clientX;

    const clientY =
        event.clientY ??
        event.changedTouches?.[0]?.clientY ??
        event.touches?.[0]?.clientY;

    if (clientX == null || clientY == null) {
        return null;
    }

    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    return { x, y };
}

function onViewerPointerDown(event) {
    const clientX =
        event.clientX ??
        event.changedTouches?.[0]?.clientX ??
        event.touches?.[0]?.clientX;

    const clientY =
        event.clientY ??
        event.changedTouches?.[0]?.clientY ??
        event.touches?.[0]?.clientY;

    if (clientX == null || clientY == null) {
        pointerDownInfo = null;
        return;
    }

    pointerDownInfo = {
        x: clientX,
        y: clientY
    };
}

function isTapInteraction(event) {
    if (!pointerDownInfo) {
        return false;
    }

    const clientX =
        event.clientX ??
        event.changedTouches?.[0]?.clientX ??
        event.touches?.[0]?.clientX;

    const clientY =
        event.clientY ??
        event.changedTouches?.[0]?.clientY ??
        event.touches?.[0]?.clientY;

    if (clientX == null || clientY == null) {
        return false;
    }

    const deltaX = clientX - pointerDownInfo.x;
    const deltaY = clientY - pointerDownInfo.y;
    const distance = Math.hypot(deltaX, deltaY);

    return distance <= TAP_MOVE_THRESHOLD;
}

function onViewerClicked(event) {
    if (simulationState === SimulationState.RUNNING || activePlacementMode === PlacementMode.NONE) {
        pointerDownInfo = null;
        return;
    }

    if (!isTapInteraction(event)) {
        pointerDownInfo = null;
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerNdc = getPointerNdc(event);
    if (!pointerNdc) {
        pointerDownInfo = null;
        return;
    }

    // Refresh preview/snapped state on tap before placement.
    updateVentPreview(pointerNdc, camera, activePlacementMode);

    let placed = false;

    if (activePlacementMode === PlacementMode.INTAKE) {
        placed = tryPlaceIntakeVent();
    } else if (activePlacementMode === PlacementMode.STATIC) {
        placed = tryPlaceStaticVent();
    } else if (activePlacementMode === PlacementMode.RIDGE) {
        placed = tryPlaceRidgeVent();
    }

    if (placed) {
        refreshResultsPanel();
        updateVentStatusMessage();
    }

    pointerDownInfo = null;
}

function onViewerPointerMove(event) {
    if (simulationState === SimulationState.RUNNING || activePlacementMode === PlacementMode.NONE) {
        hideVentPreview();
        return;
    }

    const pointerNdc = getPointerNdc(event);
    if (!pointerNdc) {
        return;
    }

    updateVentPreview(pointerNdc, camera, activePlacementMode);
}

function onViewerPointerLeave() {
    hideVentPreview();
    pointerDownInfo = null;
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
    hideVentPreview();
    updateSimulationButtonUI();
    updatePlacementButtonUI();

    if (isMobilePanelMode()) {
        openResultsPanel();
    }

    updateVentStatusMessage({ forceReveal: true });
}

function onResetClicked() {
    simulationState = SimulationState.RESET;
    resetAirflowSimulation();
    clearAllVents();
    hideVentPreview();
    activePlacementMode = PlacementMode.NONE;
    pointerDownInfo = null;

    simulationState = SimulationState.IDLE;
    updateSimulationButtonUI();
    updatePlacementButtonUI();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });

    if (isMobilePanelMode()) {
        openControlsPanel();
    }
}

function applyToolbarPreset(generator) {
    if (typeof generator !== "function") {
        return;
    }

    if (isSimulationRunning()) {
        resetAirflowSimulation();
    }

    simulationState = SimulationState.IDLE;
    activePlacementMode = PlacementMode.NONE;
    pointerDownInfo = null;
    cancelPendingRidgePlacement();
    hideVentPreview();

    const applied = generator();
    if (!applied) {
        return;
    }

    updateSimulationButtonUI();
    updatePlacementButtonUI();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });

    if (isMobilePanelMode()) {
        openResultsPanel();
    }
}

function onSaveCurrentLayoutClicked() {
    savedVentLayout = exportCurrentVentLayout();
    setRestoreAvailabilityUI();
    showTemporaryStatusMessage("Current layout saved", "success", 1250);

    if (!toolbarSaveCurrentButton) {
        return;
    }

    const originalText = toolbarSaveCurrentButton.textContent;
    toolbarSaveCurrentButton.textContent = "Saved";
    window.setTimeout(() => {
        toolbarSaveCurrentButton.textContent = originalText || "Save Current";
    }, 1200);
}

function onRestoreCurrentLayoutClicked() {
    if (!savedVentLayout) {
        showTemporaryStatusMessage("No saved layout available", "warning", 1400);
        return;
    }

    if (isSimulationRunning()) {
        resetAirflowSimulation();
    }

    simulationState = SimulationState.IDLE;
    activePlacementMode = PlacementMode.NONE;
    pointerDownInfo = null;
    cancelPendingRidgePlacement();
    hideVentPreview();

    const restored = restoreVentLayout(savedVentLayout);
    if (!restored) {
        showTemporaryStatusMessage("Unable to restore saved layout", "warning", 1600);
        return;
    }

    updateSimulationButtonUI();
    updatePlacementButtonUI();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });
    showTemporaryStatusMessage("Saved layout restored", "info", 1200);

    if (isMobilePanelMode()) {
        openResultsPanel();
    }
}

// Build default geometry on load.
rebuildGeometryFromInputs();
refreshResultsPanel();
updateVentStatusMessage({ forceReveal: true });

houseWidthInput?.addEventListener("input", onGeometryInputChanged);
houseLengthInput?.addEventListener("input", onGeometryInputChanged);
roofPitchRiseInput?.addEventListener("input", onGeometryInputChanged);
overhangDepthInput?.addEventListener("input", onGeometryInputChanged);
ventRuleSelect?.addEventListener("change", onVentRuleChanged);
intakeVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.INTAKE));
staticVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.STATIC));
ridgeVentButton?.addEventListener("click", () => setPlacementMode(PlacementMode.RIDGE));
controlsToggleButton?.addEventListener("click", toggleControlsPanel);
resultsToggleButton?.addEventListener("click", toggleResultsPanel);
ventStatusCloseButton?.addEventListener("click", dismissVentStatusMessage);
toolbarSaveCurrentButton?.addEventListener("click", onSaveCurrentLayoutClicked);
toolbarRestoreCurrentButton?.addEventListener("click", onRestoreCurrentLayoutClicked);
toolbarIntakeOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateIntakeOnlyPreset));
toolbarExhaustOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateExhaustOnlyPreset));
toolbarBalancedButton?.addEventListener("click", () => applyToolbarPreset(() => generateBalancedPreset({ ventilationRule: selectedVentilationRule })));
toolbarGridToggleButton?.addEventListener("click", onGridToggleClicked);
toolbarStartButton?.addEventListener("click", onStartSimulationClicked);
toolbarResetButton?.addEventListener("click", onResetClicked);

renderer.domElement.addEventListener("pointerdown", onViewerPointerDown);
renderer.domElement.addEventListener("pointerup", onViewerClicked);
renderer.domElement.addEventListener("pointermove", onViewerPointerMove);
renderer.domElement.addEventListener("pointerleave", onViewerPointerLeave);

window.addEventListener("resize", syncResponsiveUiState);

updateSimulationButtonUI();
syncGridVisibilityUI();
updatePlacementButtonUI();
syncResponsiveUiState();
setRestoreAvailabilityUI();

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

const launchStartButton = document.getElementById("start-btn");
const launchScreen = document.getElementById("launch-screen");

if (launchStartButton && launchScreen) {
    launchStartButton.addEventListener("click", () => {
        launchScreen.style.display = "none";

        if (isMobilePanelMode()) {
            openControlsPanel();
        }
    });
}

export { selectedVentilationRule };