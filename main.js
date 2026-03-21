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
import { createRoofFloReport } from "./modules/report.js";
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
const resultAreaSourceBadge = document.getElementById("result-area-source-badge");
const resultInstalledIntake = document.getElementById("result-installed-intake");
const resultInstalledExhaust = document.getElementById("result-installed-exhaust");
const resultIntakeDiff = document.getElementById("result-intake-diff");
const resultExhaustDiff = document.getElementById("result-exhaust-diff");
const resultStatus = document.getElementById("result-status");
const ventStatusToast = document.getElementById("vent-status-toast");
const ventStatusMessage = document.getElementById("vent-status-message");
const statusIndicatorButton = document.getElementById("btn-toolbar-status");
const toolbarSaveCurrentButton = document.getElementById("btn-toolbar-save-current");
const toolbarRestoreCurrentButton = document.getElementById("btn-toolbar-restore-current");
const toolbarIntakeOnlyButton = document.getElementById("btn-toolbar-intake-only");
const toolbarExhaustOnlyButton = document.getElementById("btn-toolbar-exhaust-only");
const toolbarBalancedButton = document.getElementById("btn-toolbar-balanced");
const toolbarGridToggleButton = document.getElementById("btn-toolbar-grid-toggle");
const toolbarStartButton = document.getElementById("btn-toolbar-start");
const toolbarResetButton = document.getElementById("btn-toolbar-reset");
const toolbarResultsButton = document.getElementById("btn-toolbar-results");
const snapshotPresentButton = document.getElementById("btn-snapshot-present");
const workspace = document.getElementById("workspace");
const compactSetupButton = document.getElementById("btn-compact-setup");
const compactPlacementButton = document.getElementById("btn-compact-placement");
const compactPresetsButton = document.getElementById("btn-compact-presets");
const compactSnapshotsButton = document.getElementById("btn-compact-snapshots");
const compactOpenButton = document.getElementById("btn-compact-open");
const compactQuickPlacement = document.getElementById("compact-quick-placement");
const compactQuickPresets = document.getElementById("compact-quick-presets");
const quickPlacementIntakeButton = document.getElementById("btn-quick-placement-intake");
const quickPlacementStaticButton = document.getElementById("btn-quick-placement-static");
const quickPlacementRidgeButton = document.getElementById("btn-quick-placement-ridge");
const quickPresetIntakeButton = document.getElementById("btn-quick-preset-intake");
const quickPresetExhaustButton = document.getElementById("btn-quick-preset-exhaust");
const quickPresetBalancedButton = document.getElementById("btn-quick-preset-balanced");
const snapshotStrip = document.getElementById("snapshot-strip");
const snapshotAddButton = document.getElementById("btn-snapshot-add");
const workspaceTabButtons = Array.from(document.querySelectorAll(".workspace-tab"));
const workspaceTabPanels = Array.from(document.querySelectorAll(".workspace-tab-panel"));
const presentationOverlay = document.getElementById("presentation-overlay");
const presentationStepIndicator = document.getElementById("presentation-step-indicator");
const presentationStepTitle = document.getElementById("presentation-step-title");
const presentationStepSupport = document.getElementById("presentation-step-support");
const presentationResumeButton = document.getElementById("btn-presentation-resume");
const presentationBackButton = document.getElementById("btn-presentation-back");
const presentationNextButton = document.getElementById("btn-presentation-next");
const presentationExitButton = document.getElementById("btn-presentation-exit");
const reportOverlay = document.getElementById("report-overlay");
const reportGeneratedAt = document.getElementById("report-generated-at");
const reportSolutionType = document.getElementById("report-solution-type");
const reportCurrentLabel = document.getElementById("report-current-label");
const reportCurrentIntakeCount = document.getElementById("report-current-intake-count");
const reportCurrentStaticCount = document.getElementById("report-current-static-count");
const reportCurrentRidgeLinearFeet = document.getElementById("report-current-ridge-linear-feet");
const reportCurrentRequiredTotal = document.getElementById("report-current-required-total");
const reportCurrentRequiredIntake = document.getElementById("report-current-required-intake");
const reportCurrentRequiredExhaust = document.getElementById("report-current-required-exhaust");
const reportCurrentInstalledIntake = document.getElementById("report-current-installed-intake");
const reportCurrentInstalledExhaust = document.getElementById("report-current-installed-exhaust");
const reportCurrentStatus = document.getElementById("report-current-status");
const reportSolutionLabel = document.getElementById("report-solution-label");
const reportSolutionIntakeCount = document.getElementById("report-solution-intake-count");
const reportSolutionStaticCount = document.getElementById("report-solution-static-count");
const reportSolutionRidgeLinearFeet = document.getElementById("report-solution-ridge-linear-feet");
const reportSolutionRequiredTotal = document.getElementById("report-solution-required-total");
const reportSolutionRequiredIntake = document.getElementById("report-solution-required-intake");
const reportSolutionRequiredExhaust = document.getElementById("report-solution-required-exhaust");
const reportSolutionInstalledIntake = document.getElementById("report-solution-installed-intake");
const reportSolutionInstalledExhaust = document.getElementById("report-solution-installed-exhaust");
const reportSolutionStatus = document.getElementById("report-solution-status");
const reportExplanationHeadline = document.getElementById("report-explanation-headline");
const reportExplanationSummary = document.getElementById("report-explanation-summary");
const reportExplanationBullets = document.getElementById("report-explanation-bullets");
const reportVerdictStatus = document.getElementById("report-verdict-status");
const reportVerdictSummary = document.getElementById("report-verdict-summary");
const reportActionHeading = document.getElementById("report-action-heading");
const reportActionItems = document.getElementById("report-action-items");
const reportActionClosing = document.getElementById("report-action-closing");
const reportCurrentIntakeDiff = document.getElementById("report-current-intake-diff");
const reportCurrentExhaustDiff = document.getElementById("report-current-exhaust-diff");
const reportSolutionIntakeDiff = document.getElementById("report-solution-intake-diff");
const reportSolutionExhaustDiff = document.getElementById("report-solution-exhaust-diff");
const reportBackViewerButton = document.getElementById("btn-report-back-viewer");
const reportExplanationClosing = document.getElementById("report-explanation-closing");
const reportCurrentRidgeHelper = document.getElementById("report-current-ridge-helper");
const reportSolutionRidgeHelper = document.getElementById("report-solution-ridge-helper");
const reportCloseButton = document.getElementById("btn-report-close");

const placementButtons = [
    { mode: PlacementMode.INTAKE, button: intakeVentButton },
    { mode: PlacementMode.STATIC, button: staticVentButton },
    { mode: PlacementMode.RIDGE, button: ridgeVentButton }
];

let simulationState = SimulationState.IDLE;
let activePlacementMode = PlacementMode.NONE;
let workspaceUiState = {
    activeWorkspaceTab: "setup",
    isDrawerOpen: false,
    compactQuickMode: "none",
    isResultsOpen: false,
    isGridVisible: true,
    isSnapshotSaveAnimating: false
};
let lastVentStatusKey = null;
let savedVentLayout = null;
let currentLayoutSource = "unknown";
let transientStatusTimer = null;
let statusPopoverTimer = null;
let snapshotSlides = [];
let activeSnapshotId = null;
let snapshotSlideIdSeed = 1;
let draggingSnapshotId = null;
let importedAtticArea = null;
let calculationSource = "geometry"; // "calculator" | "geometry"
const GEOMETRY_MATCH_TOLERANCE_SQFT = 10;
let isPresentationMode = false;
let presentationStepIndex = 0;
let presentationBaseSnapshot = null;
let isPresentationAutoCamera = false;
let hasPresentationCameraOverride = false;
let presentationCameraTransition = null;
let presentationSolutionPhase = 0;
let isSolutionSequenceRunning = false;
let presentationSolutionTimers = [];
let activeReport = null;
let presentationGridVisibilityBefore = null;

function setPresentationFootprintEmphasis(enabled) {
    const geometryState = getGeometryState();
    const footprint = geometryState?.buildingFootprintBase;

    if (!footprint || !footprint.material) {
        return;
    }

    const materials = Array.isArray(footprint.material) ? footprint.material : [footprint.material];

    for (const material of materials) {
        if (!material) {
            continue;
        }

        if (!material.userData.__footprintBaseStyle) {
            material.userData.__footprintBaseStyle = {
                opacity: material.opacity,
                roughness: material.roughness,
                metalness: material.metalness
            };
        }

        const baseStyle = material.userData.__footprintBaseStyle;

        if (enabled) {
            material.opacity = Math.min((baseStyle.opacity ?? 0.85) + 0.12, 0.98);
            if (typeof material.roughness === "number") {
                material.roughness = Math.max((baseStyle.roughness ?? 0.82) - 0.12, 0);
            }
            if (typeof material.metalness === "number") {
                material.metalness = Math.min((baseStyle.metalness ?? 0) + 0.04, 1);
            }
        } else {
            material.opacity = baseStyle.opacity;
            if (typeof material.roughness === "number") {
                material.roughness = baseStyle.roughness;
            }
            if (typeof material.metalness === "number") {
                material.metalness = baseStyle.metalness;
            }
        }

        material.needsUpdate = true;
    }
}

function initializeLucideIcons() {
    if (!window.lucide || typeof window.lucide.createIcons !== "function") {
        return;
    }

    window.lucide.createIcons();
}
let calculatorViewerEntryTimer = null;
let calculatorViewerHintTimer = null;

const presentationSteps = [
    {
        id: "baseline",
        title: "No effective ventilation traps heat and moisture",
        support: "Trapped heat and moisture can shorten roof life and damage the roof system.",
        scenario: "none"
    },
    {
        id: "imbalanced",
        title: "An unbalanced system restricts airflow",
        support: "Adding only one side of the system limits performance.",
        scenario: "exhaust-only"
    },
    {
        id: "balanced",
        title: "Balanced ventilation moves air through the attic",
        support: "Intake and exhaust work together to help heat and moisture escape.",
        scenario: "balanced"
    },
    {
        id: "current-snapshot",
        title: "This is how your roof is currently ventilated",
        support: "Review the existing system before seeing the upgrade plan.",
        scenario: "current-snapshot"
    },
    {
        id: "solution-sequence",
        title: "Here\u2019s how we fix it",
        support: "Upgrading intake and exhaust together creates a complete, balanced system.",
        scenario: "solution-sequence"
    }
];

const presentationCameraPresets = [
    {
        position: { x: 10, y: 8.5, z: 15.5 },
        target: { x: 0, y: 4.1, z: 0 },
        durationMs: 300
    },
    {
        position: { x: -12.5, y: 9.2, z: 18.5 },
        target: { x: 0.7, y: 4.3, z: -0.2 },
        durationMs: 300
    },
    {
        position: { x: 18, y: 11.2, z: 25.5 },
        target: { x: 0, y: 4.2, z: 0 },
        durationMs: 320
    },
    {
        position: { x: 12.5, y: 10.2, z: 18.5 },
        target: { x: 0, y: 4.4, z: 0 },
        durationMs: 360
    },
    {
        position: { x: 16.2, y: 14.6, z: 20.5 },
        target: { x: 0, y: 5.4, z: 0 },
        durationMs: 380
    }
];

const PRESENTATION_AUTO_ROTATE_SPEED = 0.55;
const PRESENTATION_CAMERA_TRANSITION_MS = 320;
const PRESENTATION_RESUME_TARGET_ONLY_MS = 220;
const PRESENTATION_RESUME_NEAR_DISTANCE_SQ = 2.25;
const PRESENTATION_SOLUTION_REVEAL_MS = 1800;
const PRESENTATION_SOLUTION_PHASE_HOLD_MS = 2800;
const PRESENTATION_SOLUTION_SIMULATION_DELAY_MS = 1200;
const SNAPSHOT_ROLES = new Set(["problem", "partial", "balanced", "current", "solution", "custom"]);

// Store selected ventilation rule for future calculations.
let selectedVentilationRule = ventRuleSelect?.value || "1/150";

// Tap-vs-drag tracking for mobile-safe placement
let pointerDownInfo = null;
const TAP_MOVE_THRESHOLD = 10;

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isGeometryDependentTab(tab) {
    return tab === "placement" || tab === "presets";
}

function getViewerDerivedAtticArea() {
    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    return calculateAtticArea(buildingWidth, buildingLength);
}

function getImportedGeometryMatchData() {
    if (calculationSource !== "calculator" || importedAtticArea === null || importedAtticArea <= 0) {
        return null;
    }

    const viewerArea = getViewerDerivedAtticArea();
    const difference = Math.abs(viewerArea - importedAtticArea);

    return {
        importedArea: importedAtticArea,
        viewerArea,
        difference,
        tolerance: GEOMETRY_MATCH_TOLERANCE_SQFT,
        isWithinTolerance: difference <= GEOMETRY_MATCH_TOLERANCE_SQFT
    };
}

function isImportedGeometryGateActive() {
    const matchData = getImportedGeometryMatchData();
    return Boolean(matchData && !matchData.isWithinTolerance);
}

function revealGeometryGateGuidance() {
    openDrawerToTab("setup");
    showTemporaryStatusMessage("Match viewer attic area to imported calculator area first", "info", 2100);
}

function syncImportedGeometryGateState() {
    const geometryGateActive = isImportedGeometryGateActive();

    if (geometryGateActive && isGeometryDependentTab(workspaceUiState.activeWorkspaceTab)) {
        setWorkspaceTab("setup");
    }

    syncSetupImportBanner();
    updateSimulationButtonUI();
    updatePlacementButtonUI();
}

function getPresentationCameraPreset(index) {
    const safeIndex = Math.max(0, Math.min(presentationCameraPresets.length - 1, index));
    return presentationCameraPresets[safeIndex];
}

function setCameraPoseFromPreset(preset) {
    if (!preset) {
        return;
    }

    camera.position.set(preset.position.x, preset.position.y, preset.position.z);
    controls.target.set(preset.target.x, preset.target.y, preset.target.z);
    controls.update();
}

function startPresentationCameraTransition(stepIndex, { immediate = false, durationMs = null, targetOnly = false } = {}) {
    const preset = getPresentationCameraPreset(stepIndex);
    if (!preset) {
        return;
    }

    if (immediate) {
        presentationCameraTransition = null;
        setCameraPoseFromPreset(preset);
        return;
    }

    controls.autoRotate = false;

    presentationCameraTransition = {
        startedAt: performance.now(),
        durationMs: durationMs ?? preset.durationMs ?? PRESENTATION_CAMERA_TRANSITION_MS,
        targetOnly,
        fromPosition: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        },
        toPosition: {
            x: preset.position.x,
            y: preset.position.y,
            z: preset.position.z
        },
        fromTarget: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
        },
        toTarget: {
            x: preset.target.x,
            y: preset.target.y,
            z: preset.target.z
        }
    };
}

function updatePresentationCameraTransition(now) {
    if (!presentationCameraTransition) {
        return;
    }

    const elapsed = Math.max(0, now - presentationCameraTransition.startedAt);
    const t = Math.min(1, elapsed / presentationCameraTransition.durationMs);
    const eased = 1 - Math.pow(1 - t, 3);

    const fromPos = presentationCameraTransition.fromPosition;
    const toPos = presentationCameraTransition.toPosition;
    const fromTarget = presentationCameraTransition.fromTarget;
    const toTarget = presentationCameraTransition.toTarget;

    if (!presentationCameraTransition.targetOnly) {
        camera.position.set(
            fromPos.x + ((toPos.x - fromPos.x) * eased),
            fromPos.y + ((toPos.y - fromPos.y) * eased),
            fromPos.z + ((toPos.z - fromPos.z) * eased)
        );
    }

    controls.target.set(
        fromTarget.x + ((toTarget.x - fromTarget.x) * eased),
        fromTarget.y + ((toTarget.y - fromTarget.y) * eased),
        fromTarget.z + ((toTarget.z - fromTarget.z) * eased)
    );

    if (t >= 1) {
        presentationCameraTransition = null;
        controls.autoRotate = isPresentationMode && isPresentationAutoCamera;
    }
}

function restartPresentationSimulation() {
    resetAirflowSimulation();
    simulationState = SimulationState.IDLE;

    const started = startAirflowSimulation({
        scene,
        getGeometryState,
        getVents: getAirflowVentState
    });

    if (started) {
        simulationState = SimulationState.RUNNING;
    }

    updateSimulationButtonUI();
}

function cancelSolutionSequence() {
    for (const timerId of presentationSolutionTimers) {
        clearTimeout(timerId);
    }
    presentationSolutionTimers = [];
    isSolutionSequenceRunning = false;
    presentationSolutionPhase = 0;
}

function scheduleSolutionSequenceStep(callback, delayMs) {
    const timerId = setTimeout(() => {
        presentationSolutionTimers = presentationSolutionTimers.filter((id) => id !== timerId);
        callback();
    }, delayMs);

    presentationSolutionTimers.push(timerId);
    return timerId;
}

function setPresentationPhaseMessage(title, support) {
    if (presentationStepTitle) {
        presentationStepTitle.textContent = title;
    }
    if (presentationStepSupport) {
        presentationStepSupport.textContent = support;
    }
}

function startSolutionSequence() {
    if (!isPresentationMode) {
        return;
    }

    cancelSolutionSequence();

    const solutionSlide = getSnapshotByRole("solution");

    if (!solutionSlide) {
        clearAllVents();
        generateBalancedPreset({ ventilationRule: selectedVentilationRule });
        presentationSolutionPhase = 3;
        setPresentationPhaseMessage(
            "Balanced Roof Ventilation System",
            "Now air moves through the attic the way the roof system is designed to perform."
        );
        restartPresentationSimulation();
        refreshResultsPanel();
        updateVentStatusMessage({ forceReveal: true });
        return;
    }

    const solutionSnapshot = coerceSnapshot(solutionSlide.snapshot);
    if (!solutionSnapshot) {
        return;
    }

    const currentLayout = exportCurrentVentLayout() || { intake: [], static: [], ridge: [] };
    const currentStatic = Array.isArray(currentLayout.static) ? currentLayout.static : [];
    const currentRidge = Array.isArray(currentLayout.ridge) ? currentLayout.ridge : [];

    const solutionIntake = solutionSnapshot.vents.intake;
    const solutionStatic = solutionSnapshot.vents.static;
    const solutionRidge = solutionSnapshot.vents.ridge;

    isSolutionSequenceRunning = true;
    presentationSolutionPhase = 1;

    setPresentationPhaseMessage(
        "Intake Upgrade",
        "Fresh air must be able to enter the attic properly."
    );

    scheduleSolutionSequenceStep(() => {
        if (!isPresentationMode || !isSolutionSequenceRunning) {
            return;
        }

        restoreVentLayout({
            intake: solutionIntake,
            static: currentStatic,
            ridge: currentRidge
        });
        refreshResultsPanel();
        updateVentStatusMessage({ forceReveal: true });
    }, PRESENTATION_SOLUTION_REVEAL_MS);

    scheduleSolutionSequenceStep(() => {
        if (!isPresentationMode || !isSolutionSequenceRunning) {
            return;
        }

        presentationSolutionPhase = 2;
        setPresentationPhaseMessage(
            "Exhaust Upgrade",
            "Heat and moisture need a clear path to escape."
        );
        scheduleSolutionSequenceStep(() => {
            if (!isPresentationMode || !isSolutionSequenceRunning) {
                return;
            }

            restoreVentLayout({
                intake: solutionIntake,
                static: solutionStatic,
                ridge: solutionRidge
            });
            refreshResultsPanel();
            updateVentStatusMessage({ forceReveal: true });

            scheduleSolutionSequenceStep(() => {
                if (!isPresentationMode || !isSolutionSequenceRunning) {
                    return;
                }

                presentationSolutionPhase = 3;
                setPresentationPhaseMessage(
                    "Balanced Airflow Achieved",
                    "Now air moves through the attic the way the roof system is designed to perform."
                );

                scheduleSolutionSequenceStep(() => {
                    if (!isPresentationMode || !isSolutionSequenceRunning) {
                        return;
                    }

                    isSolutionSequenceRunning = false;
                    restartPresentationSimulation();
                }, PRESENTATION_SOLUTION_SIMULATION_DELAY_MS);
            }, PRESENTATION_SOLUTION_PHASE_HOLD_MS);
        }, PRESENTATION_SOLUTION_REVEAL_MS);
    }, PRESENTATION_SOLUTION_REVEAL_MS + PRESENTATION_SOLUTION_PHASE_HOLD_MS);
}

function setPresentationAutoCameraState(enabled, { userOverride = false } = {}) {
    isPresentationAutoCamera = enabled;
    hasPresentationCameraOverride = userOverride;

    controls.autoRotate = enabled;
    controls.autoRotateSpeed = PRESENTATION_AUTO_ROTATE_SPEED;
    controls.enableDamping = true;
    controls.enabled = isPresentationMode;

    if (!isPresentationMode) {
        controls.autoRotate = false;
        controls.enabled = true;
        hasPresentationCameraOverride = false;
        isPresentationAutoCamera = false;
    }

    if (presentationResumeButton) {
        presentationResumeButton.hidden = !isPresentationMode || !hasPresentationCameraOverride;
    }
}

function interruptPresentationAutoCamera() {
    if (!isPresentationMode || !isPresentationAutoCamera) {
        return;
    }

    presentationCameraTransition = null;
    setPresentationAutoCameraState(false, { userOverride: true });
}

function updatePresentationStepUi() {
    if (!isPresentationMode) {
        return;
    }

    const step = presentationSteps[presentationStepIndex];
    if (!step) {
        return;
    }

    if (presentationStepIndicator) {
        presentationStepIndicator.textContent = `Step ${presentationStepIndex + 1} of ${presentationSteps.length}`;
    }
    if (presentationStepTitle) {
        presentationStepTitle.textContent = step.title;
    }
    if (presentationStepSupport) {
        presentationStepSupport.textContent = step.support;
    }
    if (presentationBackButton) {
        presentationBackButton.disabled = presentationStepIndex === 0;
    }
    if (presentationNextButton) {
        presentationNextButton.textContent = presentationStepIndex === presentationSteps.length - 1 ? "View Report" : "Next";
    }
    if (presentationResumeButton) {
        presentationResumeButton.hidden = !hasPresentationCameraOverride;
    }
}

function syncPresentationUiState() {
    workspace?.classList.toggle("is-presentation-mode", isPresentationMode);

    if (presentationOverlay) {
        presentationOverlay.hidden = !isPresentationMode;
    }

    if (snapshotPresentButton) {
        snapshotPresentButton.setAttribute("aria-label", isPresentationMode ? "Presentation mode active" : "Start presentation mode");
        snapshotPresentButton.setAttribute("title", isPresentationMode ? "Presentation Mode Active" : "Start Presentation");
        snapshotPresentButton.textContent = isPresentationMode ? "Presenting..." : "Present";
    }

    if (isPresentationMode) {
        hideStatusPopover();
        controls.enabled = true;
    }

    setPresentationFootprintEmphasis(isPresentationMode);

    setPresentationAutoCameraState(isPresentationMode && !hasPresentationCameraOverride, { userOverride: hasPresentationCameraOverride });

    updatePresentationStepUi();
    updateSimulationButtonUI();
    updatePlacementButtonUI();
}

function loadPresentationStep(index) {
    if (!isPresentationMode || !presentationBaseSnapshot) {
        return false;
    }

    cancelSolutionSequence();

    const clampedIndex = Math.max(0, Math.min(presentationSteps.length - 1, index));
    presentationStepIndex = clampedIndex;
    const step = presentationSteps[presentationStepIndex];

    const restored = restoreViewerSnapshot(presentationBaseSnapshot);
    if (!restored) {
        return false;
    }

    let shouldStartSimulation = true;

    if (step.scenario === "none") {
        clearAllVents();
    } else if (step.scenario === "exhaust-only") {
        clearAllVents();
        generateExhaustOnlyPreset();
    } else if (step.scenario === "balanced") {
        clearAllVents();
        generateBalancedPreset({ ventilationRule: selectedVentilationRule });
    } else if (step.scenario === "current-snapshot") {
        const currentSlide = getSnapshotByRole("current");
        if (currentSlide) {
            restoreViewerSnapshot(currentSlide.snapshot);
        }
        shouldStartSimulation = true;
    } else if (step.scenario === "solution-sequence") {
        const currentSlide = getSnapshotByRole("current");
        if (currentSlide) {
            restoreViewerSnapshot(currentSlide.snapshot);
        }
        shouldStartSimulation = false;
    }

    simulationState = SimulationState.IDLE;
    activePlacementMode = PlacementMode.NONE;
    pointerDownInfo = null;
    cancelPendingRidgePlacement();
    hideVentPreview();
    clearVentPreview();

    startPresentationCameraTransition(presentationStepIndex);

    if (shouldStartSimulation) {
        restartPresentationSimulation();
    } else {
        updateSimulationButtonUI();
    }

    if (step.scenario === "solution-sequence") {
        startSolutionSequence();
    }

    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });
    updatePresentationStepUi();
    updateSimulationButtonUI();
    updatePlacementButtonUI();
    return true;
}

function enterPresentationMode() {
    if (isPresentationMode) {
        return;
    }

    presentationBaseSnapshot = createViewerSnapshot({ source: currentLayoutSource || "unknown" });
    if (!presentationBaseSnapshot) {
        return;
    }

    isPresentationMode = true;
    presentationStepIndex = 0;
    presentationGridVisibilityBefore = workspaceUiState.isGridVisible;
    workspaceUiState.isGridVisible = false;
    syncGridVisibilityUI();
    closeCompactQuickModes();
    hasPresentationCameraOverride = false;
    presentationCameraTransition = null;
    syncPresentationUiState();
    loadPresentationStep(0);
}

function exitPresentationMode({ restoreBaseSnapshot = true } = {}) {
    if (!isPresentationMode) {
        return;
    }

    const snapshotToRestore = presentationBaseSnapshot;
    isPresentationMode = false;
    presentationStepIndex = 0;
    presentationBaseSnapshot = null;
    hasPresentationCameraOverride = false;
    presentationCameraTransition = null;
    cancelSolutionSequence();
    setPresentationAutoCameraState(false);

    if (presentationGridVisibilityBefore !== null) {
        workspaceUiState.isGridVisible = presentationGridVisibilityBefore;
        presentationGridVisibilityBefore = null;
        syncGridVisibilityUI();
    }

    if (restoreBaseSnapshot && snapshotToRestore) {
        restoreViewerSnapshot(snapshotToRestore);
    }

    syncPresentationUiState();
    refreshResultsPanel();
    updateVentStatusMessage({ forceReveal: true });
}

function getViewerFallbackReportEntry(label) {
    return {
        snapshotId: null,
        label,
        snapshot: createViewerSnapshot({ label, source: currentLayoutSource || "unknown" })
    };
}

function getSnapshotReportEntryByRole(role) {
    const slide = getSnapshotByRole(role);
    const snapshot = coerceSnapshot(slide?.snapshot);

    if (!slide || !snapshot) {
        return null;
    }

    return {
        snapshotId: slide.id,
        label: slide.label,
        snapshot
    };
}

function buildRoofFloReport() {
    const currentFromRole = getSnapshotReportEntryByRole("current");
    const solutionFromRole = getSnapshotReportEntryByRole("solution");

    const currentEntry = currentFromRole || getViewerFallbackReportEntry("Current Viewer State");
    const solutionEntry = solutionFromRole || getViewerFallbackReportEntry("Recommended Solution (Viewer Fallback)");

    const solutionType = solutionFromRole?.snapshot?.solutionType || "balanced";

    return createRoofFloReport({
        generatedAt: new Date().toISOString(),
        solutionType,
        currentEntry,
        solutionEntry
    });
}

function applyReportSectionToUi(section, uiNodes, statusLabel) {
    if (!section || !uiNodes) {
        return;
    }

    const {
        labelNode,
        intakeNode,
        staticNode,
        ridgeNode,
        ridgeHelperNode,
        requiredTotalNode,
        requiredIntakeNode,
        requiredExhaustNode,
        installedIntakeNode,
        installedExhaustNode,
        intakeDiffNode,
        exhaustDiffNode,
        statusNode
    } = uiNodes;

    if (labelNode) {
        labelNode.textContent = section.label || statusLabel;
    }

    if (intakeNode) {
        intakeNode.textContent = String(section.counts?.intake ?? 0);
    }

    if (staticNode) {
        staticNode.textContent = String(section.counts?.static ?? 0);
    }

    if (ridgeNode) {
        const ridgeFeet = Number(section.counts?.ridgeLinearFeet ?? 0);
        ridgeNode.textContent = `${ridgeFeet.toFixed(1)} ft`;
    }

    if (ridgeHelperNode) {
        const ridgeFeet = Number(section.counts?.ridgeLinearFeet ?? 0);
        if (ridgeFeet > 0.5) {
            ridgeHelperNode.textContent = "Continuous ridge coverage";
            ridgeHelperNode.hidden = false;
        } else {
            ridgeHelperNode.hidden = true;
        }
    }

    if (requiredTotalNode) {
        requiredTotalNode.textContent = formatVentilationValue(section.nfva?.requiredNetFreeArea ?? 0);
    }

    if (requiredIntakeNode) {
        requiredIntakeNode.textContent = formatVentilationValue(section.nfva?.requiredIntake ?? 0);
    }

    if (requiredExhaustNode) {
        requiredExhaustNode.textContent = formatVentilationValue(section.nfva?.requiredExhaust ?? 0);
    }

    if (installedIntakeNode) {
        installedIntakeNode.textContent = formatVentilationValue(section.nfva?.installedIntake ?? 0);
    }

    if (installedExhaustNode) {
        installedExhaustNode.textContent = formatVentilationValue(section.nfva?.installedExhaust ?? 0);
    }

    function applyDiffNode(node, diffValue) {
        if (!node) {
            return;
        }
        const num = Number(diffValue);
        const NEAR_ZERO = 5;
        const isNeutral = Math.abs(num) < NEAR_ZERO;
        const isPositive = !isNeutral && num > 0;
        const isNegative = !isNeutral && num < 0;
        const sign = num > 0 ? "+" : "";
        node.textContent = `${sign}${formatVentilationValue(Math.abs(num))}`;
        node.classList.toggle("delta-positive", isPositive);
        node.classList.toggle("delta-negative", isNegative);
        node.classList.toggle("delta-neutral", isNeutral);
    }

    applyDiffNode(intakeDiffNode, section.nfva?.intakeDiff ?? 0);
    applyDiffNode(exhaustDiffNode, section.nfva?.exhaustDiff ?? 0);

    if (statusNode) {
        statusNode.textContent = section.status || statusLabel;
    }
}

function renderRoofFloReport(report) {
    if (!report) {
        return;
    }

    if (reportGeneratedAt) {
        const generatedDate = new Date(report.generatedAt);
        reportGeneratedAt.textContent = `Generated ${generatedDate.toLocaleString()}`;
    }

    if (reportSolutionType) {
        reportSolutionType.textContent = report.solutionType || "balanced";
    }

    applyReportSectionToUi(report.current, {
        labelNode: reportCurrentLabel,
        intakeNode: reportCurrentIntakeCount,
        staticNode: reportCurrentStaticCount,
        ridgeNode: reportCurrentRidgeLinearFeet,
        ridgeHelperNode: reportCurrentRidgeHelper,
        requiredTotalNode: reportCurrentRequiredTotal,
        requiredIntakeNode: reportCurrentRequiredIntake,
        requiredExhaustNode: reportCurrentRequiredExhaust,
        installedIntakeNode: reportCurrentInstalledIntake,
        installedExhaustNode: reportCurrentInstalledExhaust,
        intakeDiffNode: reportCurrentIntakeDiff,
        exhaustDiffNode: reportCurrentExhaustDiff,
        statusNode: reportCurrentStatus
    }, "Current Status");

    applyReportSectionToUi(report.solution, {
        labelNode: reportSolutionLabel,
        intakeNode: reportSolutionIntakeCount,
        staticNode: reportSolutionStaticCount,
        ridgeNode: reportSolutionRidgeLinearFeet,
        ridgeHelperNode: reportSolutionRidgeHelper,
        requiredTotalNode: reportSolutionRequiredTotal,
        requiredIntakeNode: reportSolutionRequiredIntake,
        requiredExhaustNode: reportSolutionRequiredExhaust,
        installedIntakeNode: reportSolutionInstalledIntake,
        installedExhaustNode: reportSolutionInstalledExhaust,
        intakeDiffNode: reportSolutionIntakeDiff,
        exhaustDiffNode: reportSolutionExhaustDiff,
        statusNode: reportSolutionStatus
    }, "Solution Status");

    const systemVerdict = report.verdict?.systemVerdict;
    const recommendedAction = report.verdict?.recommendedAction;

    if (reportVerdictStatus) {
        const status = systemVerdict?.status === "PASS" ? "PASS" : "FAIL";
        reportVerdictStatus.textContent = status;
        reportVerdictStatus.classList.toggle("is-pass", status === "PASS");
        reportVerdictStatus.classList.toggle("is-fail", status === "FAIL");
    }

    if (reportVerdictSummary) {
        reportVerdictSummary.textContent = systemVerdict?.summary || "Current ventilation is imbalanced and below required airflow targets.";
    }

    if (reportActionHeading) {
        reportActionHeading.textContent = recommendedAction?.heading || "Recommended System: Balanced";
    }

    if (reportActionItems) {
        reportActionItems.innerHTML = "";
        const items = Array.isArray(recommendedAction?.items) && recommendedAction.items.length > 0
            ? recommendedAction.items
            : ["Review attic ventilation and apply balanced intake and exhaust upgrades."];

        for (const line of items) {
            const item = document.createElement("li");
            item.textContent = line;
            reportActionItems.appendChild(item);
        }
    }

    if (reportActionClosing) {
        reportActionClosing.textContent = recommendedAction?.closing || "This brings the system into proper airflow balance.";
    }

    if (reportExplanationHeadline) {
        reportExplanationHeadline.textContent = report.explanation?.headline || "Recommended ventilation layout";
    }

    if (reportExplanationSummary) {
        reportExplanationSummary.textContent = report.explanation?.summary || "The recommended solution improves intake and exhaust balance to support attic airflow.";
    }

    if (reportExplanationBullets) {
        reportExplanationBullets.innerHTML = "";
        const bullets = Array.isArray(report.explanation?.bullets) ? report.explanation.bullets : [];

        for (const bullet of bullets) {
            const item = document.createElement("li");
            item.textContent = bullet;
            reportExplanationBullets.appendChild(item);
        }
    }

    if (reportExplanationClosing) {
        reportExplanationClosing.textContent = report.explanation?.closing || "This helps reduce heat buildup and moisture issues over time.";
    }
}

function openRoofFloReport(report) {
    if (!report) {
        return;
    }

    activeReport = report;
    renderRoofFloReport(report);
    workspace?.classList.add("is-report-open");

    if (reportOverlay) {
        reportOverlay.hidden = false;
    }

    closeResultsPanel();
    hideStatusPopover();
}

function closeRoofFloReport() {
    activeReport = null;
    workspace?.classList.remove("is-report-open");

    if (reportOverlay) {
        reportOverlay.hidden = true;
    }
}

function onViewReportFromPresentation() {
    exitPresentationMode({ restoreBaseSnapshot: false });
    const report = buildRoofFloReport();
    openRoofFloReport(report);
}

function onPresentationNextClicked() {
    if (!isPresentationMode) {
        return;
    }

    if (presentationStepIndex >= presentationSteps.length - 1) {
        onViewReportFromPresentation();
        return;
    }

    loadPresentationStep(presentationStepIndex + 1);
}

function onPresentationBackClicked() {
    if (!isPresentationMode) {
        return;
    }

    loadPresentationStep(presentationStepIndex - 1);
}

function onPresentationResumeClicked() {
    if (!isPresentationMode) {
        return;
    }

    hasPresentationCameraOverride = false;
    const preset = getPresentationCameraPreset(presentationStepIndex);
    if (preset) {
        const dx = camera.position.x - preset.position.x;
        const dy = camera.position.y - preset.position.y;
        const dz = camera.position.z - preset.position.z;
        const distanceSq = (dx * dx) + (dy * dy) + (dz * dz);

        if (distanceSq <= PRESENTATION_RESUME_NEAR_DISTANCE_SQ) {
            startPresentationCameraTransition(presentationStepIndex, {
                targetOnly: true,
                durationMs: PRESENTATION_RESUME_TARGET_ONLY_MS
            });
        } else {
            startPresentationCameraTransition(presentationStepIndex);
        }
    }

    setPresentationAutoCameraState(true, { userOverride: false });
}

function createSnapshotSlide(snapshot, options = {}) {
    const normalized = coerceSnapshot(snapshot);
    if (!normalized) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(options, "role")) {
        normalized.role = normalizeSnapshotRole(options.role, { allowNull: true });
    }

    if (Object.prototype.hasOwnProperty.call(options, "solutionType")) {
        normalized.solutionType = normalizeSnapshotSolutionType(options.solutionType);
    }

    if (Object.prototype.hasOwnProperty.call(options, "isUserCreated")) {
        normalized.isUserCreated = normalizeSnapshotIsUserCreated(options.isUserCreated);
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
    const snapshot = createViewerSnapshot({
        source: currentLayoutSource || "unknown",
        label: typeof options.label === "string" ? options.label : null,
        role: Object.prototype.hasOwnProperty.call(options, "role") ? options.role : null,
        solutionType: Object.prototype.hasOwnProperty.call(options, "solutionType") ? options.solutionType : null,
        isUserCreated: Object.prototype.hasOwnProperty.call(options, "isUserCreated") ? options.isUserCreated : true
    });
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

function getSnapshotsByRole(role) {
    const normalizedRole = normalizeSnapshotRoleQuery(role);
    if (!normalizedRole) {
        return [];
    }

    return snapshotSlides.filter((slide) => slide?.snapshot?.role === normalizedRole);
}

function getSnapshotByRole(role) {
    return getSnapshotsByRole(role)[0] || null;
}

function setSnapshotRole(snapshotId, role, { solutionType } = {}) {
    const slide = snapshotSlides.find((item) => item.id === snapshotId);
    if (!slide || !slide.snapshot) {
        return false;
    }

    slide.snapshot.role = normalizeSnapshotRole(role, { allowNull: true });
    if (solutionType !== undefined) {
        slide.snapshot.solutionType = normalizeSnapshotSolutionType(solutionType);
    }

    return true;
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
    showTemporaryStatusMessage("Slide loaded", "info", 1200);
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

        const role = slide.snapshot?.role || null;
        const roleRow = document.createElement("div");
        roleRow.className = "snapshot-role-row";

        if (role === "current" || role === "solution") {
            const badge = document.createElement("span");
            badge.className = `snapshot-role-badge snapshot-role-badge--${role}`;
            badge.textContent = role === "current" ? "Current" : "Solution";
            roleRow.appendChild(badge);
        } else {
            const markCurrent = document.createElement("button");
            markCurrent.type = "button";
            markCurrent.className = "snapshot-role-mark-btn";
            markCurrent.textContent = "Mark Current";
            markCurrent.title = "Mark this slide as the current system on this home";
            markCurrent.addEventListener("click", (event) => {
                event.stopPropagation();
                setSnapshotRole(slide.id, "current");
                renderSnapshotStrip();
            });

            const markSolution = document.createElement("button");
            markSolution.type = "button";
            markSolution.className = "snapshot-role-mark-btn";
            markSolution.textContent = "Mark Solution";
            markSolution.title = "Mark this slide as the recommended solution for this home";
            markSolution.addEventListener("click", (event) => {
                event.stopPropagation();
                setSnapshotRole(slide.id, "solution");
                renderSnapshotStrip();
            });

            roleRow.appendChild(markCurrent);
            roleRow.appendChild(markSolution);
        }

        card.appendChild(roleRow);

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

function normalizeSnapshotRole(role, { allowNull = true } = {}) {
    if (role == null) {
        return allowNull ? null : "custom";
    }

    if (typeof role !== "string") {
        return allowNull ? null : "custom";
    }

    const normalizedRole = role.trim().toLowerCase();
    if (!normalizedRole) {
        return allowNull ? null : "custom";
    }

    if (SNAPSHOT_ROLES.has(normalizedRole)) {
        return normalizedRole;
    }

    return "custom";
}

function normalizeSnapshotRoleQuery(role) {
    if (role == null) {
        return null;
    }

    if (typeof role !== "string") {
        return null;
    }

    const normalizedRole = role.trim().toLowerCase();
    if (!normalizedRole) {
        return null;
    }

    return SNAPSHOT_ROLES.has(normalizedRole) ? normalizedRole : null;
}

function normalizeSnapshotSolutionType(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function normalizeSnapshotIsUserCreated(value) {
    return typeof value === "boolean" ? value : null;
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

function createViewerSnapshot({ label = null, source = null, role = null, solutionType = null, isUserCreated = null } = {}) {
    const vents = exportCurrentVentLayout();
    const normalizedRole = normalizeSnapshotRole(role, { allowNull: true });
    const normalizedSolutionType = normalizeSnapshotSolutionType(solutionType);
    const normalizedIsUserCreated = normalizeSnapshotIsUserCreated(isUserCreated);

    return {
        version: 1,
        createdAt: new Date().toISOString(),
        role: normalizedRole,
        solutionType: normalizedSolutionType,
        isUserCreated: normalizedIsUserCreated,
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
        const normalizedRole = normalizeSnapshotRole(snapshotCandidate.role ?? snapshotCandidate.meta?.role, { allowNull: true });
        const normalizedSolutionType = normalizeSnapshotSolutionType(snapshotCandidate.solutionType ?? snapshotCandidate.meta?.solutionType);
        const normalizedIsUserCreated = normalizeSnapshotIsUserCreated(snapshotCandidate.isUserCreated ?? snapshotCandidate.meta?.isUserCreated);

        return {
            version: 1,
            createdAt: typeof snapshotCandidate.createdAt === "string"
                ? snapshotCandidate.createdAt
                : new Date().toISOString(),
            role: normalizedRole,
            solutionType: normalizedSolutionType,
            isUserCreated: normalizedIsUserCreated,
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
            role: null,
            solutionType: null,
            isUserCreated: null,
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
    const geometryGateActive = isImportedGeometryGateActive();
    const presentationLocked = isPresentationMode;

    if (toolbarStartButton) {
        toolbarStartButton.disabled = running || geometryGateActive || presentationLocked;
        toolbarStartButton.classList.toggle("is-active", running);
        if (running) {
            toolbarStartButton.setAttribute("aria-label", "Simulation running");
            toolbarStartButton.setAttribute("title", "Simulation Running");
        } else if (presentationLocked) {
            toolbarStartButton.setAttribute("aria-label", "Exit presentation mode to start simulation");
            toolbarStartButton.setAttribute("title", "Exit Presentation to start simulation");
        } else if (geometryGateActive) {
            toolbarStartButton.setAttribute("aria-label", "Match viewer and imported attic area first");
            toolbarStartButton.setAttribute("title", "Match viewer attic area to imported area before simulation");
        } else {
            toolbarStartButton.setAttribute("aria-label", "Start simulation");
            toolbarStartButton.setAttribute("title", "Start Simulation");
        }
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
    if (isImportedGeometryGateActive() && isGeometryDependentTab(tab)) {
        tab = "setup";
    }

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

function closeCompactQuickModes() {
    workspaceUiState.compactQuickMode = "none";
}

function openDrawerToTab(tab) {
    if (isImportedGeometryGateActive() && isGeometryDependentTab(tab)) {
        tab = "setup";
    }

    workspaceUiState.isDrawerOpen = true;
    closeCompactQuickModes();
    if (tab) {
        setWorkspaceTab(tab);
    }
    syncWorkspaceUiState();
}

function toggleCompactQuickMode(mode) {
    workspaceUiState.isDrawerOpen = false;
    workspaceUiState.compactQuickMode = workspaceUiState.compactQuickMode === mode ? "none" : mode;
    syncWorkspaceUiState();
}

function syncWorkspaceUiState() {
    if (!controlPanel || !resultsPanel || !controlsToggleButton) {
        return;
    }

    controlPanel.classList.toggle("is-closed", !workspaceUiState.isDrawerOpen);
    compactQuickPlacement.hidden = workspaceUiState.compactQuickMode !== "placement";
    compactQuickPresets.hidden = workspaceUiState.compactQuickMode !== "presets";

    const geometryGateActive = isImportedGeometryGateActive();

    const hasActivePlacementMode = activePlacementMode !== PlacementMode.NONE;
    compactPlacementButton?.classList.toggle("is-active", workspaceUiState.compactQuickMode === "placement" || hasActivePlacementMode);
    compactPresetsButton?.classList.toggle("is-active", workspaceUiState.compactQuickMode === "presets");
    compactSetupButton?.classList.toggle("is-active", workspaceUiState.activeWorkspaceTab === "setup" && !workspaceUiState.compactQuickMode);
    compactSnapshotsButton?.classList.toggle("is-active", workspaceUiState.activeWorkspaceTab === "snapshots" && !workspaceUiState.compactQuickMode);
    compactPlacementButton?.setAttribute("aria-pressed", (workspaceUiState.compactQuickMode === "placement" || hasActivePlacementMode) ? "true" : "false");
    compactPresetsButton?.setAttribute("aria-pressed", workspaceUiState.compactQuickMode === "presets" ? "true" : "false");
    compactSetupButton?.setAttribute("aria-pressed", workspaceUiState.activeWorkspaceTab === "setup" ? "true" : "false");
    compactSnapshotsButton?.setAttribute("aria-pressed", workspaceUiState.activeWorkspaceTab === "snapshots" ? "true" : "false");
    compactPlacementButton && (compactPlacementButton.disabled = geometryGateActive);
    compactPresetsButton && (compactPresetsButton.disabled = geometryGateActive);
    compactPlacementButton?.setAttribute("title", geometryGateActive ? "Match viewer attic area to imported area" : "Vent Placement");
    compactPresetsButton?.setAttribute("title", geometryGateActive ? "Match viewer attic area to imported area" : "Presets");

    for (const tabButton of workspaceTabButtons) {
        const tab = tabButton.dataset.tab;
        const tabIsLocked = Boolean(tab && isGeometryDependentTab(tab) && geometryGateActive);
        tabButton.disabled = tabIsLocked;
        tabButton.setAttribute("aria-disabled", tabIsLocked ? "true" : "false");
        if (tabIsLocked) {
            tabButton.setAttribute("title", "Match viewer attic area to imported area");
        } else {
            tabButton.removeAttribute("title");
        }
    }

    resultsPanel.classList.toggle("is-open", workspaceUiState.isResultsOpen);
    resultsPanel.setAttribute("aria-hidden", workspaceUiState.isResultsOpen ? "false" : "true");

    controlsToggleButton.setAttribute("aria-expanded", workspaceUiState.isDrawerOpen ? "true" : "false");
    controlsToggleButton.setAttribute("title", workspaceUiState.isDrawerOpen ? "Collapse Tool Panel" : "Expand Tool Panel");

    compactOpenButton?.setAttribute("aria-label", "Open tool drawer");
    compactOpenButton?.setAttribute("title", "Open Drawer");

    if (toolbarResultsButton) {
        toolbarResultsButton.classList.toggle("is-active", workspaceUiState.isResultsOpen);
        toolbarResultsButton.setAttribute("aria-pressed", workspaceUiState.isResultsOpen ? "true" : "false");
    }

    const compactQuickModeOpen = workspaceUiState.compactQuickMode !== "none";
    controlPanel.classList.toggle("has-compact-quick-open", compactQuickModeOpen);
    compactOpenButton?.setAttribute("aria-label", compactQuickModeOpen ? "Close quick toolbar" : "Open tool drawer");
    compactOpenButton?.setAttribute("title", compactQuickModeOpen ? "Close Quick Toolbar" : "Open Drawer");
}

function toggleToolPanel() {
    workspaceUiState.isDrawerOpen = !workspaceUiState.isDrawerOpen;
    if (workspaceUiState.isDrawerOpen) {
        closeCompactQuickModes();
    }
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
    const ventilationRule = selectedVentilationRule || "1/150";
    const atticAreaSqFt = getEffectiveAtticArea();
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

function getStatusToneFromMessageData(messageData) {
    const ventilationState = getVentilationState();

    if (ventilationState === "none") {
        return "red";
    }

    if (ventilationState === "exhaust") {
        return "orange";
    }

    if (ventilationState === "intake") {
        return "blue";
    }

    if (messageData?.state === "success") {
        return "green";
    }

    if (messageData?.state === "warning") {
        return "orange";
    }

    return "blue";
}

function showStatusPopover(durationMs = 0) {
    if (!ventStatusToast) {
        return;
    }

    if (statusPopoverTimer) {
        window.clearTimeout(statusPopoverTimer);
        statusPopoverTimer = null;
    }

    ventStatusToast.classList.add("is-visible");
    ventStatusToast.setAttribute("aria-hidden", "false");
    statusIndicatorButton?.setAttribute("aria-expanded", "true");

    if (durationMs > 0) {
        statusPopoverTimer = window.setTimeout(() => {
            statusPopoverTimer = null;
            hideStatusPopover();
        }, durationMs);
    }
}

function hideStatusPopover() {
    if (!ventStatusToast) {
        return;
    }

    if (statusPopoverTimer) {
        window.clearTimeout(statusPopoverTimer);
        statusPopoverTimer = null;
    }

    ventStatusToast.classList.remove("is-visible");
    ventStatusToast.setAttribute("aria-hidden", "true");
    statusIndicatorButton?.setAttribute("aria-expanded", "false");
}

function isMobileStatusInteraction() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function onStatusIndicatorPointerEnter() {
    if (isMobileStatusInteraction()) {
        return;
    }

    showStatusPopover();
}

function onStatusIndicatorPointerLeave() {
    if (isMobileStatusInteraction()) {
        return;
    }

    hideStatusPopover();
}

function onStatusIndicatorClicked(event) {
    event.preventDefault();
    showStatusPopover(isMobileStatusInteraction() ? 2600 : 2200);
}

function updateVentStatusMessage({ forceReveal = false } = {}) {
    const messageData = getVentilationMessageData();
    const stateChanged = messageData.key !== lastVentStatusKey;
    const statusTone = getStatusToneFromMessageData(messageData);

    if (ventStatusMessage) {
        ventStatusMessage.textContent = messageData.message;
    }

    if (statusIndicatorButton) {
        statusIndicatorButton.classList.remove("status-red", "status-orange", "status-blue", "status-green");
        statusIndicatorButton.classList.add(`status-${statusTone}`);
        statusIndicatorButton.setAttribute("aria-label", `Ventilation status: ${messageData.message}`);
        statusIndicatorButton.setAttribute("title", messageData.message);
    }

    if (ventStatusToast) {
        ventStatusToast.classList.remove("is-danger", "is-warning", "is-info", "is-success");
        ventStatusToast.classList.add(`is-${messageData.state}`);

        if (!ventStatusToast.classList.contains("is-visible")) {
            ventStatusToast.setAttribute("aria-hidden", "true");
        }
    }

    lastVentStatusKey = messageData.key;

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

    ventStatusMessage.textContent = message;
    ventStatusToast.classList.remove("is-danger", "is-warning", "is-info", "is-success");
    ventStatusToast.classList.add(`is-${state}`);
    showStatusPopover(durationMs);

    transientStatusTimer = window.setTimeout(() => {
        transientStatusTimer = null;
        updateVentStatusMessage({ forceReveal: true });
    }, durationMs);
}

function refreshResultsPanel() {
    const ventilationRule = selectedVentilationRule || "1/150";
    const atticAreaSqFt = getEffectiveAtticArea();
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
    if (resultAreaSourceBadge) {
        resultAreaSourceBadge.hidden = calculationSource !== "calculator";
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

    if (isPresentationMode) {
        setPresentationFootprintEmphasis(true);
    }

    initializeVentPreview();
}

function onGeometryInputChanged() {
    currentLayoutSource = "manual";
    rebuildGeometryFromInputs();
    refreshResultsPanel();
    syncImportedGeometryGateState();
    updateVentStatusMessage();
}

function onVentRuleChanged() {
    selectedVentilationRule = ventRuleSelect?.value || "1/150";
    currentLayoutSource = "manual";
    refreshResultsPanel();
    updateVentStatusMessage();
}

function updatePlacementButtonUI() {
    const geometryGateActive = isImportedGeometryGateActive();
    const presentationLocked = isPresentationMode;

    if (geometryGateActive || presentationLocked) {
        activePlacementMode = PlacementMode.NONE;
    }

    for (const item of placementButtons) {
        if (!item.button) {
            continue;
        }

        const isActive = item.mode === activePlacementMode;
        item.button.classList.toggle("is-active", isActive);
        item.button.setAttribute("aria-pressed", isActive ? "true" : "false");
        item.button.disabled = simulationState === SimulationState.RUNNING || geometryGateActive || presentationLocked;
        item.button.setAttribute("title", presentationLocked
            ? "Exit presentation mode to edit vents"
            : (geometryGateActive
                ? "Match viewer attic area to imported area before vent placement"
                : item.button.textContent || "Vent placement"));
    }

    quickPlacementIntakeButton?.classList.toggle("is-active", activePlacementMode === PlacementMode.INTAKE);
    quickPlacementStaticButton?.classList.toggle("is-active", activePlacementMode === PlacementMode.STATIC);
    quickPlacementRidgeButton?.classList.toggle("is-active", activePlacementMode === PlacementMode.RIDGE);
    quickPlacementIntakeButton && (quickPlacementIntakeButton.disabled = geometryGateActive || presentationLocked);
    quickPlacementStaticButton && (quickPlacementStaticButton.disabled = geometryGateActive || presentationLocked);
    quickPlacementRidgeButton && (quickPlacementRidgeButton.disabled = geometryGateActive || presentationLocked);
    quickPresetIntakeButton && (quickPresetIntakeButton.disabled = geometryGateActive || presentationLocked);
    quickPresetExhaustButton && (quickPresetExhaustButton.disabled = geometryGateActive || presentationLocked);
    quickPresetBalancedButton && (quickPresetBalancedButton.disabled = geometryGateActive || presentationLocked);
    toolbarIntakeOnlyButton && (toolbarIntakeOnlyButton.disabled = geometryGateActive || presentationLocked);
    toolbarExhaustOnlyButton && (toolbarExhaustOnlyButton.disabled = geometryGateActive || presentationLocked);
    toolbarBalancedButton && (toolbarBalancedButton.disabled = geometryGateActive || presentationLocked);

    const viewer = renderer.domElement;
    const isPlacementActive =
        activePlacementMode !== PlacementMode.NONE &&
        simulationState !== SimulationState.RUNNING &&
        !geometryGateActive &&
        !presentationLocked;

    viewer.classList.toggle("placement-active", isPlacementActive);

    // Keep camera controls available even while a placement mode is active.
    // Tap-vs-drag detection below prevents accidental placement during orbit.
    controls.enabled = true;

    syncWorkspaceUiState();
}

function handleCompactPlacementIconClick() {
    if (isImportedGeometryGateActive()) {
        revealGeometryGateGuidance();
        return;
    }

    if (workspaceUiState.isDrawerOpen) {
        openDrawerToTab("placement");
        return;
    }

    if (workspaceUiState.compactQuickMode === "placement") {
        openDrawerToTab("placement");
        return;
    }

    toggleCompactQuickMode("placement");
}

function handleCompactPresetsIconClick() {
    if (isImportedGeometryGateActive()) {
        revealGeometryGateGuidance();
        return;
    }

    if (workspaceUiState.isDrawerOpen) {
        openDrawerToTab("presets");
        return;
    }

    if (workspaceUiState.compactQuickMode === "presets") {
        openDrawerToTab("presets");
        return;
    }

    toggleCompactQuickMode("presets");
}

function runCompactPlacementAction(mode) {
    setPlacementMode(mode);
    syncWorkspaceUiState();
}

function onCompactDrawerHandleClicked() {
    if (workspaceUiState.compactQuickMode !== "none") {
        closeCompactQuickModes();
        syncWorkspaceUiState();
        return;
    }

    openDrawerToTab(workspaceUiState.activeWorkspaceTab || "setup");
}

function runCompactPresetAction(generator, source = "preset") {
    applyToolbarPreset(generator, source);
    closeCompactQuickModes();
    syncWorkspaceUiState();
}

function setPlacementMode(mode) {
    if (isPresentationMode) {
        return;
    }

    if (simulationState === SimulationState.RUNNING) {
        return;
    }

    if (isImportedGeometryGateActive()) {
        revealGeometryGateGuidance();
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
    if (isPresentationMode) {
        interruptPresentationAutoCamera();
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
    if (isPresentationMode || simulationState === SimulationState.RUNNING || activePlacementMode === PlacementMode.NONE || isImportedGeometryGateActive()) {
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
    if (isPresentationMode || simulationState === SimulationState.RUNNING || activePlacementMode === PlacementMode.NONE || isImportedGeometryGateActive()) {
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
    if (isPresentationMode) {
        return;
    }

    if (simulationState === SimulationState.RUNNING || isSimulationRunning()) {
        return;
    }

    if (isImportedGeometryGateActive()) {
        revealGeometryGateGuidance();
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

    if (isPresentationMode) {
        return;
    }

    if (isImportedGeometryGateActive()) {
        revealGeometryGateGuidance();
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
    openDrawerToTab("snapshots");
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
initializeLucideIcons();
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
statusIndicatorButton?.addEventListener("mouseenter", onStatusIndicatorPointerEnter);
statusIndicatorButton?.addEventListener("mouseleave", onStatusIndicatorPointerLeave);
statusIndicatorButton?.addEventListener("focus", () => showStatusPopover(2200));
statusIndicatorButton?.addEventListener("blur", hideStatusPopover);
statusIndicatorButton?.addEventListener("click", onStatusIndicatorClicked);
toolbarSaveCurrentButton?.addEventListener("click", onSaveCurrentLayoutClicked);
toolbarRestoreCurrentButton?.addEventListener("click", onRestoreCurrentLayoutClicked);
toolbarIntakeOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateIntakeOnlyPreset, "preset"));
toolbarExhaustOnlyButton?.addEventListener("click", () => applyToolbarPreset(generateExhaustOnlyPreset, "preset"));
toolbarBalancedButton?.addEventListener("click", () => applyToolbarPreset(() => generateBalancedPreset({ ventilationRule: selectedVentilationRule }), "preset"));
toolbarGridToggleButton?.addEventListener("click", onGridToggleClicked);
toolbarStartButton?.addEventListener("click", onStartSimulationClicked);
toolbarResetButton?.addEventListener("click", onResetClicked);
toolbarResultsButton?.addEventListener("click", toggleResultsPanel);
snapshotPresentButton?.addEventListener("click", () => {
    if (isPresentationMode) {
        exitPresentationMode();
        return;
    }

    enterPresentationMode();
});
compactSetupButton?.addEventListener("click", () => openDrawerToTab("setup"));
compactSnapshotsButton?.addEventListener("click", () => openDrawerToTab("snapshots"));
compactOpenButton?.addEventListener("click", onCompactDrawerHandleClicked);
compactPlacementButton?.addEventListener("click", handleCompactPlacementIconClick);
compactPresetsButton?.addEventListener("click", handleCompactPresetsIconClick);
quickPlacementIntakeButton?.addEventListener("click", () => runCompactPlacementAction(PlacementMode.INTAKE));
quickPlacementStaticButton?.addEventListener("click", () => runCompactPlacementAction(PlacementMode.STATIC));
quickPlacementRidgeButton?.addEventListener("click", () => runCompactPlacementAction(PlacementMode.RIDGE));
quickPresetIntakeButton?.addEventListener("click", () => runCompactPresetAction(generateIntakeOnlyPreset, "preset"));
quickPresetExhaustButton?.addEventListener("click", () => runCompactPresetAction(generateExhaustOnlyPreset, "preset"));
quickPresetBalancedButton?.addEventListener("click", () => runCompactPresetAction(() => generateBalancedPreset({ ventilationRule: selectedVentilationRule }), "preset"));
presentationResumeButton?.addEventListener("click", onPresentationResumeClicked);
presentationBackButton?.addEventListener("click", onPresentationBackClicked);
presentationNextButton?.addEventListener("click", onPresentationNextClicked);
presentationExitButton?.addEventListener("click", exitPresentationMode);
reportBackViewerButton?.addEventListener("click", closeRoofFloReport);
reportCloseButton?.addEventListener("click", closeRoofFloReport);
snapshotAddButton?.addEventListener("click", () => {
    const added = addSnapshotSlideFromCurrent();
    if (added) {
        openDrawerToTab("snapshots");
        showTemporaryStatusMessage("Slide added", "success", 1200);
    }
});

for (const tabButton of workspaceTabButtons) {
    tabButton.addEventListener("click", () => {
        const tab = tabButton.dataset.tab;
        if (!tab) {
            return;
        }

        openDrawerToTab(tab);
    });
}

renderer.domElement.addEventListener("pointerdown", onViewerPointerDown);
renderer.domElement.addEventListener("pointerup", onViewerClicked);
renderer.domElement.addEventListener("pointermove", onViewerPointerMove);
renderer.domElement.addEventListener("pointerleave", onViewerPointerLeave);
renderer.domElement.addEventListener("wheel", () => {
    if (isPresentationMode) {
        interruptPresentationAutoCamera();
    }
}, { passive: true });

window.addEventListener("keydown", onSnapshotStripKeydown);

updateSimulationButtonUI();
syncGridVisibilityUI();
updatePlacementButtonUI();
setWorkspaceTab(workspaceUiState.activeWorkspaceTab);
syncWorkspaceUiState();
setRestoreAvailabilityUI();
renderSnapshotStrip();
syncPresentationUiState();

let lastAnimationTime = performance.now();

function animate(now = performance.now()) {
    requestAnimationFrame(animate);
    const deltaTime = Math.min((now - lastAnimationTime) / 1000, 0.05);
    lastAnimationTime = now;

    updateAirflow(deltaTime);
    updatePresentationCameraTransition(now);
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
        role: slide.snapshot?.role ?? null,
        solutionType: slide.snapshot?.solutionType ?? null,
        isUserCreated: slide.snapshot?.isUserCreated ?? null,
        snapshot: structuredClone(slide.snapshot)
        })),
        renameSnapshotSlide: (snapshotId, label) => renameSnapshotSlide(snapshotId, label),
        reorderSnapshotSlides: (fromId, toId) => reorderSnapshotSlides(fromId, toId),
        removeSnapshotSlide: (snapshotId) => removeSnapshotSlide(snapshotId)
    };

    window.roofFloReportApi = {
        buildReport: () => buildRoofFloReport(),
        getActiveReport: () => (activeReport ? structuredClone(activeReport) : null),
        openReport: () => {
            const report = buildRoofFloReport();
            openRoofFloReport(report);
            return structuredClone(report);
        },
        closeReport: () => closeRoofFloReport()
    };
}

// ─── App Mode ─────────────────────────────────────────────────────────────
// Modes: "launch" | "viewer" | "calculator"
const launchScreen = document.getElementById("launch-screen");
const calculatorScreen = document.getElementById("calculator-screen");
const btnOpenViewer = document.getElementById("btn-open-viewer");
const btnOpenCalculator = document.getElementById("btn-open-calculator");
const btnCalcBack = document.getElementById("btn-calc-back");

const calcAtticAreaInput = document.getElementById("calc-attic-area");
const calcVentRuleSelect = document.getElementById("calc-vent-rule");
const calcResultsContainer = document.getElementById("calc-results");
const calcResultTotal = document.getElementById("calc-result-total");
const calcResultIntake = document.getElementById("calc-result-intake");
const calcResultExhaust = document.getElementById("calc-result-exhaust");
const calcRuleHelpText = document.getElementById("calc-rule-help-text");
const calcCopyResultsButton = document.getElementById("btn-calc-copy-results");
const calcShareResultsButton = document.getElementById("btn-calc-share-results");
const setupImportBanner = document.getElementById("setup-import-banner");
const setupImportAreaSpan = document.getElementById("setup-import-area");
const setupViewerAreaSpan = document.getElementById("setup-viewer-area");
const setupAreaMatchStatus = document.getElementById("setup-area-match-status");
const setupImportBannerSub = document.getElementById("setup-import-banner-sub");
const setupImportEntryHint = document.getElementById("setup-import-entry-hint");
const btnCalcOpenViewer = document.getElementById("btn-calc-open-viewer");
const btnSetupUseGeometry = document.getElementById("btn-setup-use-geometry");

function focusViewerSetupInput() {
    if (!houseWidthInput || !workspaceUiState.isDrawerOpen || workspaceUiState.activeWorkspaceTab !== "setup") {
        return;
    }

    requestAnimationFrame(() => {
        houseWidthInput.focus({ preventScroll: true });
    });
}

function triggerCalculatorViewerEntryPolish() {
    workspace?.classList.remove("is-mode-entering");
    void workspace?.offsetWidth;
    workspace?.classList.add("is-mode-entering");

    if (!setupImportBanner || calculationSource !== "calculator" || importedAtticArea === null || importedAtticArea <= 0) {
        return;
    }

    window.clearTimeout(calculatorViewerEntryTimer);
    window.clearTimeout(calculatorViewerHintTimer);

    setupImportBanner.classList.remove("is-highlighted");
    void setupImportBanner.offsetWidth;
    setupImportBanner.classList.add("is-highlighted");

    if (setupImportEntryHint) {
        setupImportEntryHint.hidden = false;
        setupImportEntryHint.classList.remove("is-visible");
        void setupImportEntryHint.offsetWidth;
        setupImportEntryHint.classList.add("is-visible");
    }

    calculatorViewerEntryTimer = window.setTimeout(() => {
        setupImportBanner.classList.remove("is-highlighted");
    }, 1500);

    calculatorViewerHintTimer = window.setTimeout(() => {
        if (!setupImportEntryHint) {
            return;
        }

        setupImportEntryHint.classList.remove("is-visible");
        setupImportEntryHint.hidden = true;
    }, 2600);
}

function updateVentRuleHelpText() {
    if (!calcRuleHelpText || !calcVentRuleSelect) {
        return;
    }

    if (calcVentRuleSelect.value === "1/300") {
        calcRuleHelpText.textContent = "1/300 is allowed when the attic has a qualifying continuous vapor barrier to limit indoor moisture transfer.";
        return;
    }

    calcRuleHelpText.textContent = "1/150 is typically used when a qualifying vapor barrier is not present.";
}

function getQuickCalculationSnapshot() {
    if (!calcAtticAreaInput || !calcVentRuleSelect) {
        return null;
    }

    const area = parseFloat(calcAtticAreaInput.value);
    if (!Number.isFinite(area) || area <= 0) {
        return null;
    }

    const rule = calcVentRuleSelect.value;
    const required = calculateRequiredVentilation(area, rule);
    const intake = calculateRequiredIntake(required);
    const exhaust = calculateRequiredExhaust(required);

    return {
        area,
        rule,
        required,
        intake,
        exhaust
    };
}

function buildQuickResultsText() {
    const snapshot = getQuickCalculationSnapshot();
    if (!snapshot) {
        return "RoofFlo Quick Calculator\nEnter attic floor area to generate ventilation requirements.";
    }

    return [
        "RoofFlo Quick Calculator",
        `Attic Floor Area: ${snapshot.area.toFixed(1)} sq ft`,
        `Ventilation Rule: ${snapshot.rule}`,
        `Total Ventilation Required: ${formatVentilationValue(snapshot.required)}`,
        `Intake Needed: ${formatVentilationValue(snapshot.intake)}`,
        `Exhaust Needed: ${formatVentilationValue(snapshot.exhaust)}`
    ].join("\n");
}

async function copyQuickResultsToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const temp = document.createElement("textarea");
    temp.value = text;
    temp.setAttribute("readonly", "");
    temp.style.position = "absolute";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
}

function flashCalcActionButtonText(button, nextText, ms = 1400) {
    if (!button) {
        return;
    }

    const originalText = button.textContent;
    button.textContent = nextText;
    window.setTimeout(() => {
        button.textContent = originalText;
    }, ms);
}

async function onCopyQuickResults() {
    if (!calcCopyResultsButton) {
        return;
    }

    try {
        const text = buildQuickResultsText();
        await copyQuickResultsToClipboard(text);
        flashCalcActionButtonText(calcCopyResultsButton, "Copied");
    } catch (error) {
        flashCalcActionButtonText(calcCopyResultsButton, "Copy Failed", 1800);
    }
}

async function onShareQuickResults() {
    if (!calcShareResultsButton || !navigator.share) {
        return;
    }

    try {
        await navigator.share({
            title: "RoofFlo Quick Calculator",
            text: buildQuickResultsText()
        });
    } catch (error) {
        // User-canceled shares should be silent.
    }
}

function getEffectiveAtticArea() {
    if (calculationSource === "calculator" && importedAtticArea !== null && importedAtticArea > 0) {
        return importedAtticArea;
    }

    const buildingWidth = Math.max(1, toNumber(houseWidthInput?.value, 30));
    const buildingLength = Math.max(1, toNumber(houseLengthInput?.value, 50));
    return calculateAtticArea(buildingWidth, buildingLength);
}

function syncSetupImportBanner() {
    if (!setupImportBanner) {
        return;
    }

    const matchData = getImportedGeometryMatchData();

    if (matchData) {
        if (setupImportAreaSpan) {
            setupImportAreaSpan.textContent = `${matchData.importedArea.toLocaleString("en-US", { maximumFractionDigits: 0 })} sq ft`;
        }

        if (setupViewerAreaSpan) {
            setupViewerAreaSpan.textContent = `${matchData.viewerArea.toLocaleString("en-US", { maximumFractionDigits: 1 })} sq ft`;
        }

        if (setupAreaMatchStatus) {
            if (matchData.isWithinTolerance) {
                setupAreaMatchStatus.textContent = `Within tolerance (±${matchData.tolerance} sq ft). Vent placement and simulation are enabled.`;
            } else {
                setupAreaMatchStatus.textContent = `Not yet matched (${matchData.difference.toFixed(1)} sq ft difference). Match the viewer attic area to the imported calculator area to enable vent placement and simulation.`;
            }

            setupAreaMatchStatus.classList.toggle("is-matched", matchData.isWithinTolerance);
            setupAreaMatchStatus.classList.toggle("is-unmatched", !matchData.isWithinTolerance);
        }

        if (setupImportBannerSub) {
            setupImportBannerSub.textContent = `Tolerance: within ±${matchData.tolerance} sq ft unlocks vent placement and simulation.`;
        }

        setupImportBanner.hidden = false;
    } else {
        setupImportBanner.classList.remove("is-highlighted");
        setupImportBanner.hidden = true;
        if (setupImportEntryHint) {
            setupImportEntryHint.classList.remove("is-visible");
            setupImportEntryHint.hidden = true;
        }
        if (setupAreaMatchStatus) {
            setupAreaMatchStatus.classList.remove("is-matched", "is-unmatched");
        }
    }
}

function openViewerFromCalculator() {
    const area = parseFloat(calcAtticAreaInput?.value);

    if (Number.isFinite(area) && area > 0) {
        importedAtticArea = area;
        calculationSource = "calculator";
    } else {
        importedAtticArea = null;
        calculationSource = "geometry";
    }

    selectedVentilationRule = calcVentRuleSelect?.value || "1/150";
    if (ventRuleSelect) {
        ventRuleSelect.value = selectedVentilationRule;
    }

    setAppMode("viewer");
    openDrawerToTab("setup");
    refreshResultsPanel();
    syncImportedGeometryGateState();
    updateVentStatusMessage({ forceReveal: true });
    focusViewerSetupInput();
    triggerCalculatorViewerEntryPolish();
}

function setAppMode(mode) {
    if (mode !== "viewer" && isPresentationMode) {
        exitPresentationMode();
    }

    if (launchScreen) {
        launchScreen.classList.toggle("is-hidden", mode !== "launch");
    }
    if (calculatorScreen) {
        calculatorScreen.classList.toggle("is-visible", mode === "calculator");
    }
    if (mode === "calculator" && calcAtticAreaInput) {
        // Use rAF so the element is fully visible before focusing (avoids display:none focus no-op)
        requestAnimationFrame(() => {
            calcAtticAreaInput.focus();
            calcAtticAreaInput.select();
        });
    }
}

function runQuickCalculation() {
    if (!calcAtticAreaInput || !calcVentRuleSelect || !calcResultsContainer) {
        return;
    }

    const area = parseFloat(calcAtticAreaInput.value);
    if (!Number.isFinite(area) || area <= 0) {
        if (calcResultTotal) calcResultTotal.textContent = "—";
        if (calcResultIntake) calcResultIntake.textContent = "—";
        if (calcResultExhaust) calcResultExhaust.textContent = "—";
        return;
    }

    const rule = calcVentRuleSelect.value;
    const required = calculateRequiredVentilation(area, rule);
    const intake = calculateRequiredIntake(required);
    const exhaust = calculateRequiredExhaust(required);

    if (calcResultTotal) calcResultTotal.textContent = formatVentilationValue(required);
    if (calcResultIntake) calcResultIntake.textContent = formatVentilationValue(intake);
    if (calcResultExhaust) calcResultExhaust.textContent = formatVentilationValue(exhaust);
}

btnOpenViewer?.addEventListener("click", () => {
    importedAtticArea = null;
    calculationSource = "geometry";
    syncSetupImportBanner();
    refreshResultsPanel();
    syncImportedGeometryGateState();
    setAppMode("viewer");
});
btnOpenCalculator?.addEventListener("click", () => setAppMode("calculator"));
btnCalcBack?.addEventListener("click", () => setAppMode("launch"));

calcAtticAreaInput?.addEventListener("input", runQuickCalculation);
calcVentRuleSelect?.addEventListener("change", () => {
    updateVentRuleHelpText();
    runQuickCalculation();
});

calcAtticAreaInput?.addEventListener("blur", () => {
    if (!calcAtticAreaInput) return;
    const value = parseFloat(calcAtticAreaInput.value);
    if (!calcAtticAreaInput.value.trim()) {
        runQuickCalculation();
        return;
    }

    if (!Number.isFinite(value) || value < 0) {
        calcAtticAreaInput.value = "";
        runQuickCalculation();
    }
});

calcAtticAreaInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        runQuickCalculation();
    }
});

calcCopyResultsButton?.addEventListener("click", onCopyQuickResults);
calcShareResultsButton?.addEventListener("click", onShareQuickResults);
btnCalcOpenViewer?.addEventListener("click", openViewerFromCalculator);

btnSetupUseGeometry?.addEventListener("click", () => {
    calculationSource = "geometry";
    importedAtticArea = null;
    syncSetupImportBanner();
    refreshResultsPanel();
    syncImportedGeometryGateState();
    updateVentStatusMessage();
});

if (calcShareResultsButton && navigator.share) {
    calcShareResultsButton.hidden = false;
}

updateVentRuleHelpText();

export {
    selectedVentilationRule,
    createViewerSnapshot,
    restoreViewerSnapshot,
    setSavedSnapshot,
    getSavedSnapshot,
    exportSnapshotJson,
    importSnapshotJson,
    getSnapshotByRole,
    getSnapshotsByRole,
    setSnapshotRole
};