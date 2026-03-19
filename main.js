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
const toolbarResultsButton = document.getElementById("btn-toolbar-results");
const snapshotStrip = document.getElementById("snapshot-strip");
const snapshotAddButton = document.getElementById("btn-snapshot-add");
const workspaceTabButtons = Array.from(document.querySelectorAll(".workspace-tab"));
const workspaceTabPanels = Array.from(document.querySelectorAll(".workspace-tab-panel"));

const placementButtons = [
    { mode: PlacementMode.INTAKE, button: intakeVentButton },
    { mode: PlacementMode.STATIC, button: staticVentButton },
    { mode: PlacementMode.RIDGE, button: ridgeVentButton }
];

let simulationState = SimulationState.IDLE;
let activePlacementMode = PlacementMode.NONE;
let workspaceUiState = {
    activeWorkspaceTab: "setup",
    isToolPanelExpanded: true,
    isResultsOpen: false,
    isGridVisible: true,
    isSnapshotSaveAnimating: false
};
let userDismissedVentMessage = false;
let lastVentStatusKey = null;
let savedVentLayout = null;
let currentLayoutSource = "unknown";
let transientStatusTimer = null;
let snapshotSlides = [];
let activeSnapshotId = null;
let snapshotSlideIdSeed = 1;
let draggingSnapshotId = null;

// Store selected ventilation rule for future calculations.
let selectedVentilationRule = ventRuleSelect?.value || "1/150";

// Tap-vs-drag tracking for mobile-safe placement
let pointerDownInfo = null;
const TAP_MOVE_THRESHOLD = 10;

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function createSnapshotSlide(snapshot, options = {}) {
    const normalized = coerceSnapshot(snapshot);
    if (!normalized) {
        return null;
    }

    const label = typeof options.label === "string" && options.label.trim()
        ? options.label.trim()
        : (normalized.meta?.label || `Slide ${snapshotSlideIdSeed}`);

    return {
        id: `snapshot-${snapshotSlideIdSeed++}`,
        label,
        snapshot: normalized
    };
}

function getSnapshotCardDetails(snapshot) {
    const geometry = snapshot.geometry || {};
    const vents = snapshot.vents || {};
    const intakeCount = Array.isArray(vents.intake) ? vents.intake.length : 0;
    const staticCount = Array.isArray(vents.static) ? vents.static.length : 0;
    const ridgeCount = Array.isArray(vents.ridge) ? vents.ridge.length : 0;
    const rule = snapshot.ventilation?.rule || "1/150";

    return {
        topLine: `${geometry.width ?? 30}x${geometry.length ?? 50} ft • ${rule}`,
        bottomLine: `I:${intakeCount} S:${staticCount} R:${ridgeCount}`
    };
}

function setActiveSnapshotCard(snapshotId) {
    activeSnapshotId = snapshotId;
    renderSnapshotStrip();
}

function addSnapshotSlideFromCurrent(options = {}) {
    const snapshot = createViewerSnapshot({ source: currentLayoutSource || "unknown" });
    const slide = createSnapshotSlide(snapshot, options);
    if (!slide) {
        return false;
    }

    snapshotSlides.push(slide);
    activeSnapshotId = slide.id;
    savedVentLayout = slide.snapshot;
    setRestoreAvailabilityUI();
    renderSnapshotStrip();
    return true;
}

function reorderSnapshotSlides(fromId, toId) {
    const fromIndex = snapshotSlides.findIndex((slide) => slide.id === fromId);
    const toIndex = snapshotSlides.findIndex((slide) => slide.id === toId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return;
    }

    const [moved] = snapshotSlides.splice(fromIndex, 1);
    snapshotSlides.splice(toIndex, 0, moved);
    renderSnapshotStrip();
}

function removeSnapshotSlide(snapshotId) {
    const index = snapshotSlides.findIndex((slide) => slide.id === snapshotId);
    if (index < 0) {
        return;
    }

    snapshotSlides.splice(index, 1);

    if (activeSnapshotId === snapshotId) {
        activeSnapshotId = snapshotSlides[0]?.id || null;
    }

    if (!snapshotSlides.length) {
        savedVentLayout = null;
        setRestoreAvailabilityUI();
    }

    renderSnapshotStrip();
}

function renameSnapshotSlide(snapshotId, label) {
    const slide = snapshotSlides.find((item) => item.id === snapshotId);
    if (!slide) {
        return false;
    }

    const nextLabel = typeof label === "string" ? label.trim() : "";
    if (!nextLabel) {
        return false;
    }

    slide.label = nextLabel;
    renderSnapshotStrip();
    return true;
}

function startSnapshotRename(slide, titleNode) {
    if (!slide || !titleNode || titleNode.dataset.renaming === "true") {
        return;
    }

    titleNode.dataset.renaming = "true";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "snapshot-title-input";
    input.value = slide.label;
    input.maxLength = 120;

    let finalized = false;
    const finalize = (applyChanges) => {
        if (finalized) {
            return;
        }

        finalized = true;
        titleNode.dataset.renaming = "false";

        if (applyChanges) {
            renameSnapshotSlide(slide.id, input.value);
            return;
        }

        renderSnapshotStrip();
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finalize(true);
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            finalize(false);
        }
    });

    input.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    input.addEventListener("blur", () => finalize(true));

    titleNode.replaceWith(input);
    input.focus();
    input.select();
}

function nudgeActiveSnapshot(direction) {
    if (!activeSnapshotId || snapshotSlides.length < 2) {
        return;
    }

    const fromIndex = snapshotSlides.findIndex((slide) => slide.id === activeSnapshotId);
    if (fromIndex < 0) {
        return;
    }

    const toIndex = Math.max(0, Math.min(snapshotSlides.length - 1, fromIndex + direction));
    if (toIndex === fromIndex) {
        return;
    }

    const fromSlideId = snapshotSlides[fromIndex].id;
    const toSlideId = snapshotSlides[toIndex].id;
    reorderSnapshotSlides(fromSlideId, toSlideId);
    setActiveSnapshotCard(fromSlideId);
}

function isTypingTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function onSnapshotStripKeydown(event) {
    if (isTypingTarget(event.target) || !snapshotSlides.length) {
        return;
    }

    const isSnapshotContext = controlPanel?.contains(event.target) || snapshotStrip?.contains(event.target);
    if (!isSnapshotContext && !event.altKey) {
        return;
    }

    if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeActiveSnapshot(-1);
        return;
    }

    if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeActiveSnapshot(1);
    }
}

function onSnapshotCardLoad(snapshotId) {
    const slide = snapshotSlides.find((item) => item.id === snapshotId);
    if (!slide) {
        return;
    }

    const restored = restoreViewerSnapshot(slide.snapshot);
    if (!restored) {
        showTemporaryStatusMessage("Unable to restore selected snapshot", "warning", 1600);
        return;
    }

    savedVentLayout = slide.snapshot;
    setRestoreAvailabilityUI();
    setActiveSnapshotCard(slide.id);
    showTemporaryStatusMessage("Snapshot loaded", "info", 1200);
}

function renderSnapshotStrip() {
    if (!snapshotStrip) {
        return;
    }

    snapshotStrip.innerHTML = "";

    if (!snapshotSlides.length) {
        const empty = document.createElement("div");
        empty.className = "snapshot-empty";
        empty.textContent = "Save current setup to add your first slide";
        snapshotStrip.appendChild(empty);
        return;
    }

    for (const slide of snapshotSlides) {
        const card = document.createElement("article");
        card.className = "snapshot-card";
        card.setAttribute("role", "listitem");
        card.tabIndex = 0;
        card.draggable = true;
        card.dataset.snapshotId = slide.id;

        if (slide.id === activeSnapshotId) {
            card.classList.add("is-active");
        }

        const details = getSnapshotCardDetails(slide.snapshot);

        const title = document.createElement("div");
        title.className = "snapshot-card-title";
        title.textContent = slide.label;
        title.title = "Double-click to rename";
        title.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            startSnapshotRename(slide, title);
        });
        card.appendChild(title);

        const topMeta = document.createElement("div");
        topMeta.className = "snapshot-card-meta";
        topMeta.textContent = details.topLine;
        card.appendChild(topMeta);

        const bottomMeta = document.createElement("div");
        bottomMeta.className = "snapshot-card-meta";
        bottomMeta.textContent = details.bottomLine;
        card.appendChild(bottomMeta);

        const actions = document.createElement("div");
        actions.className = "snapshot-card-actions";

        const loadButton = document.createElement("button");
        loadButton.type = "button";
        loadButton.className = "snapshot-card-btn";
        loadButton.textContent = "Load";
        loadButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onSnapshotCardLoad(slide.id);
        });

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "snapshot-card-btn snapshot-card-btn-danger";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            removeSnapshotSlide(slide.id);
        });

        actions.appendChild(loadButton);
        actions.appendChild(removeButton);
        card.appendChild(actions);

        card.addEventListener("click", () => onSnapshotCardLoad(slide.id));
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSnapshotCardLoad(slide.id);
            }
        });
        card.addEventListener("dragstart", (event) => {
            draggingSnapshotId = slide.id;
            card.classList.add("is-dragging");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", slide.id);
            }
        });
        card.addEventListener("dragend", () => {
            draggingSnapshotId = null;
            card.classList.remove("is-dragging");
            card.classList.remove("is-drop-target");
            snapshotStrip.querySelectorAll(".snapshot-card.is-drop-target").forEach((node) => {
                node.classList.remove("is-drop-target");
            });
        });
        card.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (draggingSnapshotId && draggingSnapshotId !== slide.id) {
                card.classList.add("is-drop-target");
            }
        });
        card.addEventListener("dragleave", () => {
            card.classList.remove("is-drop-target");
        });
        card.addEventListener("drop", (event) => {
            event.preventDefault();
            card.classList.remove("is-drop-target");
            const draggedId = event.dataTransfer?.getData("text/plain") || draggingSnapshotId;
            if (draggedId && draggedId !== slide.id) {
                reorderSnapshotSlides(draggedId, slide.id);
            }
        });

        snapshotStrip.appendChild(card);
    }
}

function getAirflowVentState() {
    return {
        intakeVents: getPlacedIntakeVents(),
        staticVents: getPlacedStaticVents(),
        ridgeVents: getPlacedRidgeVents()
    };
}

function getSnapshotGeometryState() {
    return {
        width: Math.max(1, toNumber(houseWidthInput?.value, 30)),
        length: Math.max(1, toNumber(houseLengthInput?.value, 50)),
        pitch: Math.max(1, toNumber(roofPitchRiseInput?.value, 6)),
        overhangDepth: Math.max(0, toNumber(overhangDepthInput?.value, 16))
    };
}

function normalizeSnapshotMeta(meta, fallbackSource = "unknown") {
    const source = meta?.source;
    const normalizedSource = source === "manual" || source === "preset" || source === "unknown"
        ? source
        : fallbackSource;

    return {
        label: typeof meta?.label === "string" ? meta.label : null,
        source: normalizedSource
    };
}

function createViewerSnapshot({ label = null, source = null } = {}) {
    const vents = exportCurrentVentLayout();

    return {
        version: 1,
        createdAt: new Date().toISOString(),
        geometry: getSnapshotGeometryState(),
        ventilation: {
            rule: selectedVentilationRule || "1/150"
        },
        vents: {
            intake: Array.isArray(vents?.intake) ? vents.intake : [],
            static: Array.isArray(vents?.static) ? vents.static : [],
            ridge: Array.isArray(vents?.ridge) ? vents.ridge : []
        },
        meta: normalizeSnapshotMeta({
            label,
            source: source || currentLayoutSource || "unknown"
        })
    };
}

function isLegacyVentLayoutObject(value) {
    if (!value || typeof value !== "object") {
        return false;
    }

    return (
        Array.isArray(value.intake) ||
        Array.isArray(value.static) ||
        Array.isArray(value.ridge)
    );
}

function coerceSnapshot(snapshotCandidate) {
    if (!snapshotCandidate || typeof snapshotCandidate !== "object") {
        return null;
    }

    if (snapshotCandidate.version === 1 && snapshotCandidate.geometry && snapshotCandidate.vents) {
        return {
            version: 1,
            createdAt: typeof snapshotCandidate.createdAt === "string"
                ? snapshotCandidate.createdAt
                : new Date().toISOString(),
            geometry: {
                width: Math.max(1, toNumber(snapshotCandidate.geometry.width, 30)),
                length: Math.max(1, toNumber(snapshotCandidate.geometry.length, 50)),
                pitch: Math.max(1, toNumber(snapshotCandidate.geometry.pitch, 6)),
                overhangDepth: Math.max(0, toNumber(snapshotCandidate.geometry.overhangDepth, 16))
            },
            ventilation: {
                rule: snapshotCandidate.ventilation?.rule === "1/300" ? "1/300" : "1/150"
            },
            vents: {
                intake: Array.isArray(snapshotCandidate.vents?.intake) ? snapshotCandidate.vents.intake : [],
                static: Array.isArray(snapshotCandidate.vents?.static) ? snapshotCandidate.vents.static : [],
                ridge: Array.isArray(snapshotCandidate.vents?.ridge) ? snapshotCandidate.vents.ridge : []
            },
            meta: normalizeSnapshotMeta(snapshotCandidate.meta, "unknown")
        };
    }

    if (isLegacyVentLayoutObject(snapshotCandidate)) {
        return {
            version: 1,
            createdAt: new Date().toISOString(),
            geometry: getSnapshotGeometryState(),
            ventilation: {
                rule: selectedVentilationRule || "1/150"
            },
            vents: {
                intake: Array.isArray(snapshotCandidate.intake) ? snapshotCandidate.intake : [],
                static: Array.isArray(snapshotCandidate.static) ? snapshotCandidate.static : [],
                ridge: Array.isArray(snapshotCandidate.ridge) ? snapshotCandidate.ridge : []
            },
            meta: {
                label: null,
                source: "unknown"
            }
        };
    }

    return null;
}

function restoreViewerSnapshot(snapshotCandidate) {
    const snapshot = coerceSnapshot(snapshotCandidate);
    if (!snapshot) {
        return false;
    }

    if (isSimulationRunning()) {
        resetAirflowSimulation();
    }

    simulationState = SimulationState.IDLE;
    activePlacementMode = PlacementMode.NONE;
    pointerDownInfo = null;
    cancelPendingRidgePlacement();
    hideVentPreview();

    if (houseWidthInput) {
        houseWidthInput.value = String(snapshot.geometry.width);
    }
    if (houseLengthInput) {
        houseLengthInput.value = String(snapshot.geometry.length);
    }
    if (roofPitchRiseInput) {
        roofPitchRiseInput.value = String(snapshot.geometry.pitch);
    }
    if (overhangDepthInput) {
        overhangDepthInput.value = String(snapshot.geometry.overhangDepth);
    }

    selectedVentilationRule = snapshot.ventilation?.rule === "1/300" ? "1/300" : "1/150";
    if (ventRuleSelect) {
        ventRuleSelect.value = selectedVentilationRule;
    }

    rebuildGeometryFromInputs();

    const restored = restoreVentLayout({
        intake: snapshot.vents.intake,
        static: snapshot.vents.static,
        ridge: snapshot.vents.ridge
    });

    if (!restored) {
        return false;
    }

    currentLayoutSource = snapshot.meta?.source || "unknown";

    updateSimulationButtonUI();
    updatePlacementButtonUI();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });

    return true;
}

function setSavedSnapshot(snapshotCandidate) {
    const snapshot = coerceSnapshot(snapshotCandidate);
    if (!snapshot) {
        return false;
    }

    savedVentLayout = snapshot;
    setRestoreAvailabilityUI();
    return true;
}

function getSavedSnapshot() {
    return savedVentLayout ? structuredClone(savedVentLayout) : null;
}

function exportSnapshotJson({ label = null, source = null, pretty = true } = {}) {
    const snapshot = createViewerSnapshot({ label, source });
    return JSON.stringify(snapshot, null, pretty ? 2 : 0);
}

function importSnapshotJson(jsonText, { restore = true, save = true } = {}) {
    if (typeof jsonText !== "string" || !jsonText.trim()) {
        return {
            ok: false,
            error: "Snapshot JSON text is required"
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        return {
            ok: false,
            error: "Invalid JSON"
        };
    }

    const snapshot = coerceSnapshot(parsed);
    if (!snapshot) {
        return {
            ok: false,
            error: "Invalid snapshot schema"
        };
    }

    if (save) {
        setSavedSnapshot(snapshot);
    }

    if (restore) {
        const restored = restoreViewerSnapshot(snapshot);
        if (!restored) {
            return {
                ok: false,
                error: "Snapshot restore failed"
            };
        }
    }

    return {
        ok: true,
        snapshot
    };
}

function updateSimulationButtonUI() {
    const running = simulationState === SimulationState.RUNNING;

    if (toolbarStartButton) {
        toolbarStartButton.disabled = running;
        toolbarStartButton.classList.toggle("is-active", running);
        toolbarStartButton.setAttribute("aria-label", running ? "Simulation running" : "Start simulation");
        toolbarStartButton.setAttribute("title", running ? "Simulation Running" : "Start Simulation");
    }
}

function syncGridVisibilityUI() {
    gridHelper.visible = workspaceUiState.isGridVisible;

    if (!toolbarGridToggleButton) {
        return;
    }

    toolbarGridToggleButton.classList.toggle("is-active", workspaceUiState.isGridVisible);
    toolbarGridToggleButton.setAttribute("aria-label", workspaceUiState.isGridVisible ? "Hide grid" : "Show grid");
    toolbarGridToggleButton.setAttribute("title", workspaceUiState.isGridVisible ? "Hide Grid" : "Show Grid");
}

function onGridToggleClicked() {
    workspaceUiState.isGridVisible = !workspaceUiState.isGridVisible;
    syncGridVisibilityUI();
}

function setWorkspaceTab(tab) {
    workspaceUiState.activeWorkspaceTab = tab;

    for (const button of workspaceTabButtons) {
        const isActive = button.dataset.tab === tab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    for (const panel of workspaceTabPanels) {
        const isActive = panel.dataset.panel === tab;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
    }
}

function syncWorkspaceUiState() {
    if (!controlPanel || !resultsPanel || !controlsToggleButton) {
        return;
    }

    controlPanel.classList.toggle("is-collapsed", !workspaceUiState.isToolPanelExpanded);
    resultsPanel.classList.toggle("is-open", workspaceUiState.isResultsOpen);
    resultsPanel.setAttribute("aria-hidden", workspaceUiState.isResultsOpen ? "false" : "true");

    controlsToggleButton.setAttribute("aria-expanded", workspaceUiState.isToolPanelExpanded ? "true" : "false");
    controlsToggleButton.setAttribute("title", workspaceUiState.isToolPanelExpanded ? "Collapse Tool Panel" : "Expand Tool Panel");
    if (toolbarResultsButton) {
        toolbarResultsButton.classList.toggle("is-active", workspaceUiState.isResultsOpen);
        toolbarResultsButton.setAttribute("aria-pressed", workspaceUiState.isResultsOpen ? "true" : "false");
    }
}

function toggleToolPanel() {
    workspaceUiState.isToolPanelExpanded = !workspaceUiState.isToolPanelExpanded;
    syncWorkspaceUiState();
}

function openResultsPanel() {
    workspaceUiState.isResultsOpen = true;
    syncWorkspaceUiState();
}

function closeResultsPanel() {
    workspaceUiState.isResultsOpen = false;
    syncWorkspaceUiState();
}

function toggleResultsPanel() {
    workspaceUiState.isResultsOpen = !workspaceUiState.isResultsOpen;
    syncWorkspaceUiState();
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
    currentLayoutSource = "manual";
    rebuildGeometryFromInputs();
    refreshResultsPanel();
    updateVentStatusMessage();
}

function onVentRuleChanged() {
    selectedVentilationRule = ventRuleSelect?.value || "1/150";
    currentLayoutSource = "manual";
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
        currentLayoutSource = "manual";
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
    openResultsPanel();

    updateVentStatusMessage({ forceReveal: true });
}

function onResetClicked() {
    simulationState = SimulationState.RESET;
    currentLayoutSource = "unknown";
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
}

function applyToolbarPreset(generator, source = "preset") {
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

    currentLayoutSource = source;

    updateSimulationButtonUI();
    updatePlacementButtonUI();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });
}

function playSnapshotSaveAnimation() {
    if (workspaceUiState.isSnapshotSaveAnimating || !toolbarSaveCurrentButton || !controlPanel) {
        return;
    }

    workspaceUiState.isSnapshotSaveAnimating = true;

    const startRect = toolbarSaveCurrentButton.getBoundingClientRect();
    const endRect = controlPanel.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "snapshot-save-ghost";
    ghost.style.left = `${startRect.left + (startRect.width * 0.5) - 55}px`;
    ghost.style.top = `${startRect.top + (startRect.height * 0.5) - 35}px`;

    const dx = (endRect.left + (endRect.width * 0.5)) - (startRect.left + (startRect.width * 0.5));
    const dy = (endRect.top + 34) - (startRect.top + (startRect.height * 0.5));
    ghost.style.setProperty("--dx", `${dx}px`);
    ghost.style.setProperty("--dy", `${dy}px`);

    document.body.appendChild(ghost);

    requestAnimationFrame(() => {
        ghost.classList.add("is-animating");
    });

    window.setTimeout(() => {
        ghost.remove();
        workspaceUiState.isSnapshotSaveAnimating = false;
    }, 620);
}

function onSaveCurrentLayoutClicked() {
    savedVentLayout = createViewerSnapshot({ source: currentLayoutSource || "unknown" });
    addSnapshotSlideFromCurrent();
    setWorkspaceTab("snapshots");
    workspaceUiState.isToolPanelExpanded = true;
    syncWorkspaceUiState();
    playSnapshotSaveAnimation();
    setRestoreAvailabilityUI();
    showTemporaryStatusMessage("Snapshot saved", "success", 1250);
}

function onRestoreCurrentLayoutClicked() {
    if (!savedVentLayout) {
        showTemporaryStatusMessage("No saved layout available", "warning", 1400);
        return;
    }

    const restored = restoreViewerSnapshot(savedVentLayout);
    if (!restored) {
        showTemporaryStatusMessage("Unable to restore saved snapshot", "warning", 1600);
        return;
    }

    showTemporaryStatusMessage("Snapshot restored", "info", 1200);

    const matchingSlide = snapshotSlides.find((slide) => slide.snapshot?.createdAt === savedVentLayout?.createdAt);
    if (matchingSlide) {
        setActiveSnapshotCard(matchingSlide.id);
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
controlsToggleButton?.addEventListener("click", toggleToolPanel);
resultsToggleButton?.addEventListener("click", toggleResultsPanel);
ventStatusCloseButton?.addEventListener("click", dismissVentStatusMessage);
toolbarSaveCurrentButton?.addEventListener("click", onSaveCurrentLayoutClicked);
toolbarRestoreCurrentButton?.addEventListener("click", onRestoreCurrentLayoutClicked);
toolbarIntakeOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateIntakeOnlyPreset, "preset"));
toolbarExhaustOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateExhaustOnlyPreset, "preset"));
toolbarBalancedButton?.addEventListener("click", () => applyToolbarPreset(() => generateBalancedPreset({ ventilationRule: selectedVentilationRule }), "preset"));
toolbarGridToggleButton?.addEventListener("click", onGridToggleClicked);
toolbarStartButton?.addEventListener("click", onStartSimulationClicked);
toolbarResetButton?.addEventListener("click", onResetClicked);
toolbarResultsButton?.addEventListener("click", toggleResultsPanel);
snapshotAddButton?.addEventListener("click", () => {
    const added = addSnapshotSlideFromCurrent();
    if (added) {
        setWorkspaceTab("snapshots");
        workspaceUiState.isToolPanelExpanded = true;
        syncWorkspaceUiState();
        showTemporaryStatusMessage("Snapshot added", "success", 1200);
    }
});

for (const tabButton of workspaceTabButtons) {
    tabButton.addEventListener("click", () => {
        const tab = tabButton.dataset.tab;
        if (!tab) {
            return;
        }

        setWorkspaceTab(tab);
        workspaceUiState.isToolPanelExpanded = true;
        syncWorkspaceUiState();
    });
}

renderer.domElement.addEventListener("pointerdown", onViewerPointerDown);
renderer.domElement.addEventListener("pointerup", onViewerClicked);
renderer.domElement.addEventListener("pointermove", onViewerPointerMove);
renderer.domElement.addEventListener("pointerleave", onViewerPointerLeave);

window.addEventListener("keydown", onSnapshotStripKeydown);

updateSimulationButtonUI();
syncGridVisibilityUI();
updatePlacementButtonUI();
setWorkspaceTab(workspaceUiState.activeWorkspaceTab);
syncWorkspaceUiState();
setRestoreAvailabilityUI();
renderSnapshotStrip();

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

if (typeof window !== "undefined") {
    window.roofFloSnapshotApi = {
        createSnapshot: (options = {}) => createViewerSnapshot(options),
        restoreSnapshot: (snapshot) => restoreViewerSnapshot(snapshot),
        setSavedSnapshot: (snapshot) => setSavedSnapshot(snapshot),
        getSavedSnapshot: () => getSavedSnapshot(),
        exportSnapshotJson: (options = {}) => exportSnapshotJson(options),
        importSnapshotJson: (jsonText, options = {}) => importSnapshotJson(jsonText, options),
        addSnapshotSlide: (options = {}) => addSnapshotSlideFromCurrent(options),
        getSnapshotSlides: () => snapshotSlides.map((slide) => ({
            id: slide.id,
            label: slide.label,
            snapshot: structuredClone(slide.snapshot)
        })),
        renameSnapshotSlide: (snapshotId, label) => renameSnapshotSlide(snapshotId, label),
        reorderSnapshotSlides: (fromId, toId) => reorderSnapshotSlides(fromId, toId),
        removeSnapshotSlide: (snapshotId) => removeSnapshotSlide(snapshotId)
    };
}

const launchStartButton = document.getElementById("start-btn");
const launchScreen = document.getElementById("launch-screen");

if (launchStartButton && launchScreen) {
    launchStartButton.addEventListener("click", () => {
        launchScreen.style.display = "none";
    });
}

export {
    selectedVentilationRule,
    createViewerSnapshot,
    restoreViewerSnapshot,
    setSavedSnapshot,
    getSavedSnapshot,
    exportSnapshotJson,
    importSnapshotJson
};