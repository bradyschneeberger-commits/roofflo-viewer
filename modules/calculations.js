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

const SOFFIT_INTAKE_NFVA_IN2 = 50;
const STATIC_VENT_NFVA_IN2 = 50;
const RIDGE_NFVA_PER_LINEAR_FOOT_IN2 = 18;

function getVentRuleDivisor(ventilationRule) {
	return ventilationRule === "1/300" ? 300 : 150;
}

function calculateRequiredVentilation({
	buildingWidth = 0,
	buildingLength = 0,
	ventilationRule = "1/150"
} = {}) {
	const width = Math.max(0, Number(buildingWidth) || 0);
	const length = Math.max(0, Number(buildingLength) || 0);
	const atticAreaSqFt = width * length;

	const divisor = getVentRuleDivisor(ventilationRule);
	const requiredVentSqFt = atticAreaSqFt / divisor;
	const requiredVentIn2 = requiredVentSqFt * 144;
	const requiredIntakeIn2 = requiredVentIn2 / 2;
	const requiredExhaustIn2 = requiredVentIn2 / 2;

	return {
		atticAreaSqFt,
		ventilationRule,
		requiredVentSqFt,
		requiredVentIn2,
		requiredIntakeIn2,
		requiredExhaustIn2
	};
}

function calculateInstalledVentilation({
	intakeCount = 0,
	staticCount = 0,
	ridgeLengthFeet = 0
} = {}) {
	const intakeVentCount = Math.max(0, Number(intakeCount) || 0);
	const staticVentCount = Math.max(0, Number(staticCount) || 0);
	const totalRidgeLengthFeet = Math.max(0, Number(ridgeLengthFeet) || 0);

	const installedIntakeIn2 = intakeVentCount * SOFFIT_INTAKE_NFVA_IN2;
	const installedExhaustIn2 =
		(staticVentCount * STATIC_VENT_NFVA_IN2) +
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
	const installedTotalIn2 = installedIntakeIn2 + installedExhaustIn2;

	if (installedTotalIn2 < requiredTotalIn2) {
		return "Under-ventilated";
	}

	if (installedIntakeIn2 < requiredIntakeIn2) {
		return "Intake Deficient";
	}

	if (installedExhaustIn2 < requiredExhaustIn2) {
		return "Exhaust Deficient";
	}

	return "Balanced";
}

export {
	SOFFIT_INTAKE_NFVA_IN2,
	STATIC_VENT_NFVA_IN2,
	RIDGE_NFVA_PER_LINEAR_FOOT_IN2,
	calculateRequiredVentilation,
	calculateInstalledVentilation,
	calculateVentilationStatus
};
