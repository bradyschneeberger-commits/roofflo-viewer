# RoofFlo — Roof Type / Roof Design Source of Truth

## 1. Purpose

This document defines how each roof type in RoofFlo should behave so new roof designs can be added without re-fighting old geometry, preset, and ventilation assumptions.

Its purpose is to create a clean contract for every roof type so that:

- geometry is modular  
- defaults are intentional  
- intake and exhaust logic are roof-specific  
- presets do not accidentally reuse the wrong assumptions  
- future roof types can be added consistently  

This document should guide:
- geometry.js  
- roof selection flow  
- setup defaults  
- placement references  
- preset routing  
- future airflow behavior  
- future report logic  

---

## 2. Core Principle

RoofFlo should never treat all roof types as variations of gable.

Instead, every roof type must define its own:

- structural shape rules  
- edge classification  
- intake assumptions  
- exhaust assumptions  
- default dimensions  
- preset behavior expectations  

Gable may be the first roof type, but it is not the universal template.

---

## 3. Shared Rules For All Roof Types

Global scale:
- 1 unit = 1 foot  

Inputs:
- roofType  
- buildingWidth  
- buildingLength  
- pitchRise  
- overhangDepth  
- ventilationRule  

Rebuild behavior:
- geometry must rebuild cleanly on input change  
- no duplicate meshes  
- no stale geometry left in scene  
- switching roof type must fully replace old geometry and references  

Footprint rule:
- attic area calculations are based on building footprint, not overhangs  

Overhang rule:
- overhangs must be intentional per roof type  
- overhang behavior cannot be blindly mirrored  

Pitch rule:
- pitch is rise / 12  
- must be applied across the correct span for that roof type  

Visual rule:
- each roof type must read clearly and believably from default camera  

Architecture rule:
- each roof type must function independently  
- presets and placement must route directly to that roof type  

---

## 4. Required Roof-Type Contract

Each roof type must define:

Geometry Identity:
- number of slopes  
- ridge presence or absence  
- high and low edges  

Default Dimensions:
- width  
- length  
- pitch  
- overhang  

Edge Classification:
- intakeEdges  
- exhaustEdges  
- ridgeEdges  
- sideEdges  
- wallEdges (future)  

Ventilation Assumptions:
- where intake occurs  
- where exhaust occurs  
- whether ridge logic applies  
- whether symmetry applies  

Placement References:
- intake placement reference  
- exhaust placement reference  
- ridge reference (if valid)  

Preset Behavior:
- Intake Only  
- Exhaust Only  
- Balanced  

Camera Intent:
- how the roof should be framed by default  

---

## 5. Geometry Module Structure

createAtticGeometry({
  roofType,
  buildingWidth,
  buildingLength,
  pitchRise,
  overhangDepth,
  ventilationRule
})

switch (roofType) {
  case "gable":
    return createGableRoof(params);
  case "shed":
    return createShedRoof(params);
  case "hip":
    return createHipRoof(params);
}

Each roof should return:

{
  roofType,
  roofEnvelope,
  atticCore,
  intakeZones,
  placementReferences,
  edgeClassification
}

---

## 6. Roof Type: Gable

Identity:
- two slopes  
- centered ridge  
- mirrored  

Defaults:
- Width: 30 ft  
- Length: 50 ft  
- Pitch: 6/12  

Edge Classification:
- intake: both eaves  
- exhaust: upper slopes / ridge  
- ridge: center  

Ventilation:
- intake both sides  
- exhaust near ridge  
- ridge logic valid  

Presets:
- Intake Only → both eaves  
- Exhaust Only → upper slopes / ridge  
- Balanced → both  

---

## 7. Roof Type: Shed

Identity:
- one slope  
- no ridge  
- no symmetry  

Defaults:
- Width: 20 ft  
- Length: 40 ft  
- Pitch: 4/12  

Edge Classification:
- intake: low side  
- exhaust: high side  
- ridge: none  

Ventilation:
- intake at low side  
- exhaust at high side  
- no ridge logic  
- no mirrored logic  

Presets:
- Intake Only → low side  
- Exhaust Only → high side  
- Balanced → low + high  

Critical Rule:
Shed must NEVER:
- use ridge assumptions  
- use mirrored slope logic  
- treat high edge as eave  

---

## 8. Roof Type: Hip

Identity:
- four slopes  
- short ridge or apex  

Defaults:
- Width: 30 ft  
- Length: 50 ft  
- Pitch: 6/12  

Edge Classification:
- intake: perimeter  
- exhaust: upper hip areas  

Ventilation:
- perimeter intake  
- complex exhaust strategy  

---

## 9. Preset Routing Rules

if (roofType === "gable") applyGablePreset();
if (roofType === "shed") applyShedPreset();
if (roofType === "hip") applyHipPreset();

Rule:
- presets must not fall back to gable logic  

---

## 10. Placement Reference Rules

Gable:
- dual intake  
- ridge reference  

Shed:
- single intake (low)  
- single exhaust (high)  

Hip:
- perimeter intake  
- distributed exhaust  

---

## 11. Camera Rules

Gable:
- centered  

Shed:
- emphasize slope direction  

Hip:
- show full form  

---

## 12. State / UI Rules

- roof selection sets initial state  
- setup panel reflects roofType  
- switching roofType rebuilds everything  

---

## 13. Future Constraints (Parked)

Shed to Wall:
- alters exhaust behavior  

Vaulted Ceiling:
- removes attic assumptions  

Future Roofs:
- gambrel  
- mansard  
- multi-level  

---

## 14. Implementation Order

1. finalize architecture  
2. stabilize gable  
3. refactor shed  
4. fix presets per roof type  
5. build hip  

---

## 15. Final Rule

Do not adapt gable.

Define the roof.

---

## 16. Roof-Type Isolation Rule (CRITICAL)

Each roof type must be implemented as a fully independent system.

Rules:
- No roof type may inherit geometry logic from another  
- No roof type may reuse placement logic without explicit mapping  
- No roof type may fall back to gable assumptions  
- Each roof type must define its own:
  - geometry  
  - edge classification  
  - intake logic  
  - exhaust logic  
  - preset behavior  

Prohibited:

if (roofType !== "gable") {
  useGableLogic();
}

const exhaustEdges = gableExhaustEdges;

fallbackToGableBehavior();

Required:

switch (roofType) {
  case "gable":
    return handleGable();
  case "shed":
    return handleShed();
  case "hip":
    return handleHip();
}

Philosophy:

RoofFlo is not a gable system.

It is a system of independent roof models.