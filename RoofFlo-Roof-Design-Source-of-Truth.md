# RoofFlo — Roof Type / Roof Design Source of Truth (CURRENT)

## 1. Purpose

This document defines how each roof type in RoofFlo should behave so new roof designs can be added without re-fighting old geometry, preset, placement, and ventilation assumptions.

Its purpose is to create a clean, scalable contract for every roof type so that:

* geometry is modular
* defaults are intentional
* intake and exhaust logic are roof-specific
* presets do not reuse incorrect assumptions
* manual placement and preset placement stay aligned
* complex roofs can be supported later without breaking the model

This document governs:

* geometry
* edge classification
* intake/exhaust logic
* placement references
* preset routing
* airflow routing
* future report logic

---

## 2. Core Principle

RoofFlo must never treat all roof types as variations of gable.

Each roof type must define its own:

* geometry
* edge classification
* intake behavior
* exhaust behavior
* default dimensions
* preset behavior

RoofFlo is a system of independent roof models.

---

## 3. Shared Rules For All Roof Types

### Global scale

* 1 unit = 1 foot

### Inputs

* roofType
* buildingWidth
* buildingLength
* pitchRise
* overhangDepth
* ventilationRule

### Rebuild behavior

* geometry must rebuild cleanly
* no duplicate meshes
* no stale objects
* switching roof types must replace all roof-type references

---

### Geometry Separation Rule (CRITICAL)

Every roof type must explicitly separate these concepts:

* building footprint
* attic core / enclosed attic body
* roof shell / roof envelope
* overhang
* intake zone / plenum / eave condition

#### Definitions

* **building footprint** = enclosed structure only
* **attic core** = enclosed attic air volume based ONLY on building footprint
* **roof shell / roof envelope** = outer roof geometry built from building footprint PLUS overhang extents
* **overhang** = extension of the roof beyond the building footprint
* **intake zone / plenum / eave condition** = the space between the attic core and roof shell where intake airflow occurs

#### Critical Rules

* overhang must NOT enlarge the attic core
* overhang MUST enlarge the roof shell
* the difference between attic core and roof shell defines the intake zone
* intake zones must be derived from geometry, not assumed from left/right logic
* geometry must be correct BEFORE placement logic is applied

---

### Common Roof Skeleton Rule (CRITICAL)

All major geometry layers must be derived from one shared roof definition (roof skeleton).

These include:

* roof shell
* attic core
* intake zone
* edge classification
* placement references

Required:

* define the roof once
* derive all layers from that definition

Prohibited:

* separate geometry systems for attic vs roof
* intake zones as detached perimeter patches
* compensating geometry errors with placement

Goal:
A single coherent roof system.

---

### Reference Geometry Anchoring Rule (CRITICAL)

All reference geometry must be derived from and attached to final roof surfaces.

Includes:

* ridge lines
* intake lines
* exhaust zones
* helper edges

Required:

* must sit on actual surfaces
* must be created after final geometry

Prohibited:

* floating ridge
* detached helpers
* theoretical coordinates not aligned

---

### Visual Language Consistency Rule

Shared geometry must maintain consistent visual meaning.

Examples:

* attic core = attic style
* intake zones = intake style
* helpers = helper style

Prohibited:

* accidental color/material drift

---

### Geometry Before Placement Rule (CRITICAL)

Correct order:

1. geometry
2. edge classification
3. intake/exhaust meaning
4. placement

If placement looks wrong:
→ fix geometry first

---

### Source Sync Rule (CRITICAL)

All work must use the latest version of this document.

Required:

* VS Code must have current version
* prompts must align to it

Prohibited:

* partial or outdated source usage

---

### Footprint Rule

* attic calculations use building footprint only

### Pitch Rule

* pitch = rise / 12

### Architecture Rule

* no fallback to gable logic
* each roof is independent

---

## 4. Required Roof-Type Contract

Each roof type must define:

### Geometry Identity

* slopes
* ridge or apex
* high/low edges

### Default Dimensions

* width
* length
* pitch
* overhang

### Edge Classification

* intakeEdges
* exhaustEdges
* ridgeEdges
* hipEdges
* valleyEdges

### Ventilation

* intake behavior
* exhaust behavior

### Placement References

* intake
* exhaust
* ridge

### Presets

* Intake Only
* Exhaust Only
* Balanced

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

Return shape:

{
roofType,
buildingFootprint,
roofEnvelope,
atticCore,
intakeZones,
placementReferences,
edgeClassification
}

---

## 6. Edge Segmentation Rule (CRITICAL)

Do NOT assume fixed left/right edges.

Use segmented edges for all roofs.

---

## 7. Roof Type: Gable

(stable — unchanged)

---

## 8. Roof Type: Shed

(stable — unchanged)

---

## 9. Roof Type: Hip

### Identity

* four slopes
* ridge or apex

### Defaults

* Width: 30 ft
* Length: 50 ft
* Pitch: 5/12
* Overhang: system default

---

### Critical Structure Rules

* attic core = building footprint

* roof shell = footprint + overhang

* intake zone = perimeter band

* overhang is NOT attic

* intake comes from perimeter eaves

* no left/right assumptions

---

### Edges

* intakeEdges = perimeter eaves
* hipEdges = all hips
* ridgeEdges = if present
* valleyEdges = future

---

### Ventilation

* intake = perimeter
* hips = not exhaust
* ridge = only if exists

---

### Placement

* perimeter-based
* no left/right logic

---

### Presets

* Intake Only → perimeter
* Exhaust Only → valid upper zones
* Balanced → both

---

## 10. Placement Rules

* follow edge roles
* align to centerlines
* manual = preset logic

---

## 11. Exhaust Restriction Rule

No exhaust on:

* hips
* valleys

---

## 12. Camera Rules

Gable → centered
Shed → slope emphasis
Hip → full mass

---

## 13. Implementation Order

1. architecture
2. gable
3. shed
4. hip geometry
5. hip placement
6. hip presets

---

## 14. Final Rule

Do not adapt gable.

Define the roof.

---

## 15. Roof-Type Isolation Rule (CRITICAL)

Each roof is independent.

No:

* shared geometry
* fallback logic

---

---

## RoofFlo Prompt Execution Template (CRITICAL)

Every implementation prompt must follow:

1. Context
2. Scope Lock
3. Governing Rules
4. Task Definition
5. Constraints
6. Expected Result
7. Validation Checklist

---
