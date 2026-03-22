# RoofFlo — Roof Type / Roof Design Source of Truth

## 1. Purpose

This document defines how each roof type in RoofFlo should behave so new roof designs can be added without re-fighting old geometry, preset, and ventilation assumptions.

Its purpose is to create a clean, scalable contract for every roof type so that:

- geometry is modular  
- defaults are intentional  
- intake and exhaust logic are roof-specific  
- presets do not reuse incorrect assumptions  
- complex roofs can be supported in the future  

This document governs:
- geometry.js  
- airflow behavior  
- placement system  
- preset routing  
- report logic (future)  

---

## 2. Core Principle

RoofFlo must never treat all roof types as variations of gable.

Each roof type must define its own:

- geometry  
- edge classification  
- intake behavior  
- exhaust behavior  
- default dimensions  
- preset behavior  

RoofFlo is a system of independent roof models.

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
- geometry must rebuild cleanly  
- no duplicate meshes  
- no stale objects  
- switching roof types replaces all references  

Footprint rule:
- attic calculations use building footprint only  

Pitch rule:
- pitch = rise / 12  
- must apply across correct span  

Visual rule:
- roof must read correctly on load  

Architecture rule:
- all roof types operate independently  
- no shared assumptions between roof types  

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
- hipEdges (if present)  
- valleyEdges (if present)  
- sideEdges  

Ventilation Assumptions:
- where intake occurs  
- where exhaust occurs  
- whether ridge logic applies  
- whether symmetry applies  

Placement References:
- intake placement references  
- exhaust placement references  
- ridge references (if valid)  

Preset Behavior:
- Intake Only  
- Exhaust Only  
- Balanced  

Camera Intent:
- correct visual framing  

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

Each roof must return:

{
  roofType,
  roofEnvelope,
  atticCore,
  intakeZones,
  placementReferences,
  edgeClassification
}

---

## 6. Edge Segmentation Rule (CRITICAL)

RoofFlo must NOT assume a fixed number of intake or exhaust edges.

Instead, all roofs must define **edge segments**.

Edge segments represent real roof edges such as:
- eaves  
- ridges  
- hips  
- valleys  
- wall terminations  

Each roof must return collections such as:

intakeEdges: []
exhaustEdges: []
ridgeEdges: []
hipEdges: []
valleyEdges: []

Simple roofs may have:
- 1–4 intake edges

Complex roofs may have:
- many intake edges (bump-outs, additions, intersections)

This allows RoofFlo to scale beyond simple shapes.

---

## 7. Roof Type: Gable

Identity:
- two slopes  
- centered ridge  
- mirrored  

Defaults:
- 30 ft width  
- 50 ft length  
- 6/12 pitch  

Edges:
- intakeEdges: two eaves  
- exhaustEdges: upper slopes / ridge  
- ridgeEdges: center  

Ventilation:
- intake both sides  
- exhaust near ridge  

Presets:
- Intake Only → both eaves  
- Exhaust Only → ridge / upper slopes  
- Balanced → both  

---

## 8. Roof Type: Shed

Identity:
- one slope  
- no ridge  
- no symmetry  

Defaults:
- 20 ft width  
- 40 ft length  
- 4/12 pitch  

Edges:
- intakeEdges: low eave (single)  
- exhaustEdges: high edge  
- ridgeEdges: none  

Ventilation:
- intake at low side  
- exhaust at high side  

Critical Rules:
- no ridge logic  
- no mirrored logic  
- no dual intake system  

Presets:
- Intake Only → low side  
- Exhaust Only → high side  
- Balanced → low + high  

---

## 9. Roof Type: Hip

Identity:
- four slopes  
- short ridge or apex  

Defaults:
- 30 ft width  
- 50 ft length  
- 6/12 pitch  

Edges:
- intakeEdges: perimeter eaves  
- hipEdges: all hip lines  
- ridgeEdges: short ridge if present  

Ventilation:
- intake from all eaves  
- exhaust strategy varies  

---

## 10. Preset Routing Rules

Presets must branch by roofType:

if (roofType === "gable") applyGablePreset()
if (roofType === "shed") applyShedPreset()
if (roofType === "hip") applyHipPreset()

Rules:
- no fallback to gable logic  
- each roof type must define its own behavior  

---

## 11. Placement Reference Rules

Placement must be based on edge roles, not left/right assumptions.

Examples:

Gable:
- two intake edges  

Shed:
- one intake edge  

Hip:
- multiple perimeter intake edges  

All placement systems must use edge collections, not fixed variables.

---

## 12. Camera Rules

Gable:
- centered view  

Shed:
- emphasize slope direction  

Hip:
- show full roof mass  

---

## 13. State / UI Rules

- roof selection defines roofType  
- setup panel reflects roofType  
- switching roofType rebuilds everything  

---

## 14. Exhaust Placement Restriction Rule

Exhaust vents must NOT be placed on:

- hip edges  
- valley edges  

This applies to:
- static vents  
- ridge vents  
- turbine vents  
- power fans  
- all future exhaust types  

Rules:
- hips are restricted placement regions  
- valleys are restricted placement regions  
- placement system must block these areas  
- invalid placement should be visually indicated  

NOTE:
This rule is defined now but will be enforced when edge classification is fully implemented.

---

## 15. Future Constraints (Parked)

- shed roof terminating into wall  
- vaulted / cathedral ceilings  
- complex multi-roof systems  
- dormers  
- intersecting roof planes  

---

## 16. Implementation Order

1. finalize architecture  
2. stabilize gable  
3. refactor shed  
4. make airflow roof-type aware  
5. implement hip  
6. expand placement system  
7. expand report logic  

---

## 17. Final Rule

Do not adapt gable.

Define the roof.

---

## 18. Roof-Type Isolation Rule (CRITICAL)

Each roof type must be implemented independently.

Rules:
- no shared geometry logic  
- no shared intake/exhaust assumptions  
- no fallback to gable behavior  

Each roof must define:
- geometry  
- edge classification  
- intake logic  
- exhaust logic  
- preset behavior  

Prohibited:

if (roofType !== "gable") useGableLogic()

const exhaustEdges = gableExhaustEdges

fallbackToGableBehavior()

Required:

switch (roofType) {
  case "gable":
    return handleGable()
  case "shed":
    return handleShed()
  case "hip":
    return handleHip()
}

Philosophy:

RoofFlo is not a gable system.

It is a system of independent roof models.