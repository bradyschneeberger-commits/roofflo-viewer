/*
RoofFlo V2
File: calculations.js

Purpose:
Perform ventilation calculations and update results panel.

NFVA Assumptions:
Soffit vent = 50 in²
Static vent = 50 in²
Ridge vent = 18 in² per linear foot

Ventilation Rules:
1/150
1/300

Calculations:
- attic area
- required ventilation
- required intake
- required exhaust
- installed intake
- installed exhaust
- deficiency status

Exports:
calculateVentilation()
*/

const INTAKE_NFVA_PER_VENT_IN2 = 50;
const STATIC_NFVA_PER_VENT_IN2 = 50;
const RIDGE_NFVA_PER_LINEAR_FOOT_IN2 = 18;

function getVentRuleDivisor(ventilationRule) {
	return ventilationRule === "1/300" ? 300 : 150;
}

function calculateAtticArea(buildingWidth = 0, buildingLength = 0) {
	const width = Math.max(0, Number(buildingWidth) || 0);
	const length = Math.max(0, Number(buildingLength) || 0);
	return width * length;
}

function calculateRequiredVentilation(atticArea = 0, ventilationRule = "1/150") {
	const safeAtticArea = Math.max(0, Number(atticArea) || 0);
	const divisor = getVentRuleDivisor(ventilationRule);
	return (safeAtticArea * 144) / divisor;
}

function calculateRequiredIntake(requiredVentilationIn2 = 0) {
	const required = Math.max(0, Number(requiredVentilationIn2) || 0);
	return required / 2;
}

function calculateRequiredExhaust(requiredVentilationIn2 = 0) {
	const required = Math.max(0, Number(requiredVentilationIn2) || 0);
	return required / 2;
}

function calculateInstalledVentilation({
	intakeCount = 0,
	staticCount = 0,
	ridgeLengthFeet = 0
} = {}) {
	const intakeVentCount = Math.max(0, Number(intakeCount) || 0);
	const staticVentCount = Math.max(0, Number(staticCount) || 0);
	const totalRidgeLengthFeet = Math.max(0, Number(ridgeLengthFeet) || 0);

	const installedIntakeIn2 = intakeVentCount * INTAKE_NFVA_PER_VENT_IN2;
	const installedExhaustIn2 =
		(staticVentCount * STATIC_NFVA_PER_VENT_IN2) +
		(totalRidgeLengthFeet * RIDGE_NFVA_PER_LINEAR_FOOT_IN2);

	return {
		intakeCount: intakeVentCount,
		staticCount: staticVentCount,
		ridgeLengthFeet: totalRidgeLengthFeet,
		installedIntakeIn2,
		installedExhaustIn2,
		installedTotalIn2: installedIntakeIn2 + installedExhaustIn2
	};
}

function calculateVentilationStatus({
	requiredTotal = 0,
	requiredIntake = 0,
	requiredExhaust = 0,
	installedIntake = 0,
	installedExhaust = 0
} = {}) {
	const requiredTotalIn2 = Math.max(0, Number(requiredTotal) || 0);
	const requiredIntakeIn2 = Math.max(0, Number(requiredIntake) || 0);
	const requiredExhaustIn2 = Math.max(0, Number(requiredExhaust) || 0);
	const installedIntakeIn2 = Math.max(0, Number(installedIntake) || 0);
	const installedExhaustIn2 = Math.max(0, Number(installedExhaust) || 0);
	const intakeMeets = installedIntakeIn2 >= requiredIntakeIn2;
	const exhaustMeets = installedExhaustIn2 >= requiredExhaustIn2;

	if (intakeMeets && exhaustMeets) {
		return "Balanced";
	}

	if (!intakeMeets && !exhaustMeets) {
		return "Under-ventilated";
	}

	if (!intakeMeets && exhaustMeets) {
		return "Intake Deficient";
	}

	if (intakeMeets && !exhaustMeets) {
		return "Exhaust Deficient";
	}

	// Fallback for safety; all boolean combinations are handled above.
	return requiredTotalIn2 > 0 ? "Under-ventilated" : "Balanced";
}

function formatVentilationValue(value) {
	const safeValue = Math.max(0, Number(value) || 0);
	return `${safeValue.toFixed(1)} in² NFVA`;
}

export {
	INTAKE_NFVA_PER_VENT_IN2,
	STATIC_NFVA_PER_VENT_IN2,
	RIDGE_NFVA_PER_LINEAR_FOOT_IN2,
	calculateAtticArea,
	calculateRequiredVentilation,
	calculateRequiredIntake,
	calculateRequiredExhaust,
	calculateInstalledVentilation,
	calculateVentilationStatus,
	formatVentilationValue
};
