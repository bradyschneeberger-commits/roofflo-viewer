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
            installedExhaust: installed.installedExhaustIn2,
            intakeDiff: installed.installedIntakeIn2 - requiredIntake,
            exhaustDiff: installed.installedExhaustIn2 - requiredExhaust
        },
        status
    };
}

function buildVerdict(currentSection, solutionSection) {
    const currentStatus = currentSection.status;
    const solutionStatus = solutionSection.status;
    const solutionBalanced = solutionStatus === "Balanced";

    const summary = solutionBalanced
        ? "This upgrade corrects the airflow imbalance and brings the attic into proper balance."
        : "This upgrade improves airflow alignment and addresses the current ventilation shortfall.";

    return { title: "System Verdict", currentStatus, solutionStatus, summary };
}

function buildExplanation(currentSection, solutionSection) {
    const currentStatus = currentSection.status;
    const solutionBalanced = solutionSection.status === "Balanced";
    const currentBalanced = currentStatus === "Balanced";
    const intakeDeficient = currentStatus === "Intake Deficient";
    const exhaustDeficient = currentStatus === "Exhaust Deficient";

    let headline, summary;

    if (currentBalanced) {
        headline = "Your current system is near balanced — the upgrade makes it perform reliably";
        summary = "Your roof is reasonably ventilated right now, but small imbalances lead to premature wear. The recommended layout locks in consistent airflow year-round.";
    } else if (intakeDeficient) {
        headline = "Not enough fresh air is entering the attic";
        summary = "Without sufficient intake, your attic can't pull fresh air in. Heat and moisture get trapped, shortening shingle life and driving up cooling costs. The recommended system fixes the intake shortfall directly.";
    } else if (exhaustDeficient) {
        headline = "Hot air and moisture have nowhere to escape";
        summary = "Your attic is taking in air but has no clear path to exhaust it. Trapped heat and moisture stress the roof deck and shingles from the inside. The recommended system adds the exhaust capacity to complete the circuit.";
    } else {
        headline = "Your attic ventilation is significantly undersized";
        summary = "Both intake and exhaust are below the minimum for this roof. Heat and moisture build up with nowhere to go — accelerating wear and risking roof warranty violations. The recommended system addresses both sides of the problem.";
    }

    const closingBullet = solutionBalanced
        ? "The recommended layout satisfies both intake and exhaust requirements, producing a fully balanced system."
        : "The recommended improvements bring the system closer to the required balanced airflow targets.";

    return {
        headline,
        summary,
        bullets: [
            "Attic ventilation works by drawing cooler air in through intake vents and pushing hot, moist air out through exhaust vents — both sides must be sized correctly.",
            currentBalanced
                ? "Your current counts are close to target, but can be optimized for full-season reliability."
                : "Your current vent count does not meet the minimum free area required for your attic's square footage.",
            closingBullet
        ],
        closing: "This helps reduce heat buildup and moisture issues over time."
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
        verdict: buildVerdict(current, solution),
        explanation: buildExplanation(current, solution)
    };
}

export {
    createRoofFloReport
};
