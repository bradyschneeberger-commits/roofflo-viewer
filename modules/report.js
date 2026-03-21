import {
    calculateAtticArea,
    calculateRequiredVentilation,
    calculateRequiredIntake,
    calculateRequiredExhaust,
    calculateInstalledVentilation,
    calculateVentilationStatus
} from "./calculations.js";

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getRidgeLinearFeet(snapshot) {
    const ridgeVents = Array.isArray(snapshot?.vents?.ridge) ? snapshot.vents.ridge : [];

    return ridgeVents.reduce((sum, segment) => {
        const start = segment?.start;
        const end = segment?.end;

        if (!start || !end) {
            return sum;
        }

        const dx = toNumber(end.x) - toNumber(start.x);
        const dy = toNumber(end.y) - toNumber(start.y);
        const dz = toNumber(end.z) - toNumber(start.z);
        const length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));

        return Number.isFinite(length) ? sum + length : sum;
    }, 0);
}

function buildReportSection(entry, fallbackLabel) {
    const safeSnapshot = entry?.snapshot || {};
    const geometry = safeSnapshot.geometry || {};
    const ventilationRule = safeSnapshot.ventilation?.rule === "1/300" ? "1/300" : "1/150";

    const intakeCount = Array.isArray(safeSnapshot?.vents?.intake) ? safeSnapshot.vents.intake.length : 0;
    const staticCount = Array.isArray(safeSnapshot?.vents?.static) ? safeSnapshot.vents.static.length : 0;
    const ridgeLinearFeet = getRidgeLinearFeet(safeSnapshot);

    const atticArea = calculateAtticArea(
        Math.max(1, toNumber(geometry.width, 30)),
        Math.max(1, toNumber(geometry.length, 50))
    );

    const requiredNetFreeArea = calculateRequiredVentilation(atticArea, ventilationRule);
    const requiredIntake = calculateRequiredIntake(requiredNetFreeArea);
    const requiredExhaust = calculateRequiredExhaust(requiredNetFreeArea);

    const installed = calculateInstalledVentilation({
        intakeCount,
        staticCount,
        ridgeLengthFeet: ridgeLinearFeet
    });

    const status = calculateVentilationStatus({
        requiredTotal: requiredNetFreeArea,
        requiredIntake,
        requiredExhaust,
        installedIntake: installed.installedIntakeIn2,
        installedExhaust: installed.installedExhaustIn2
    });

    return {
        snapshotId: entry?.snapshotId || null,
        label: entry?.label || fallbackLabel,
        counts: {
            intake: intakeCount,
            static: staticCount,
            ridgeLinearFeet
        },
        nfva: {
            requiredNetFreeArea,
            requiredIntake,
            requiredExhaust,
            installedIntake: installed.installedIntakeIn2,
            installedExhaust: installed.installedExhaustIn2
        },
        status
    };
}

function buildExplanation(currentSection, solutionSection) {
    const currentBalanced = currentSection.status === "Balanced";
    const solutionBalanced = solutionSection.status === "Balanced";

    const currentDescriptor = currentBalanced
        ? "currently near balanced ventilation"
        : "currently under-ventilated or imbalanced";

    const solutionDescriptor = solutionBalanced
        ? "moves the system toward balanced airflow"
        : "improves intake and exhaust alignment";

    return {
        headline: currentBalanced
            ? "Current system is close, and the proposed layout improves consistency"
            : "Current system shows ventilation gaps that the proposal addresses",
        summary: `The roof is ${currentDescriptor}. The recommended solution ${solutionDescriptor} to support healthier attic airflow.`,
        bullets: [
            currentBalanced
                ? "Current intake and exhaust are closer to target, but airflow can still be improved."
                : "Current intake and exhaust do not meet the ideal balance, which can limit airflow through the attic.",
            "The recommended vent mix increases intake and exhaust performance toward a balanced system.",
            "Balanced attic airflow helps move heat and moisture out more effectively."
        ]
    };
}

function createRoofFloReport({
    generatedAt = new Date().toISOString(),
    solutionType = "balanced",
    currentEntry,
    solutionEntry
} = {}) {
    const current = buildReportSection(currentEntry, "Current Viewer State");
    const solution = buildReportSection(solutionEntry, "Recommended Solution");

    return {
        generatedAt,
        solutionType: typeof solutionType === "string" && solutionType.trim() ? solutionType.trim() : "balanced",
        current,
        solution,
        explanation: buildExplanation(current, solution)
    };
}

export {
    createRoofFloReport
};
