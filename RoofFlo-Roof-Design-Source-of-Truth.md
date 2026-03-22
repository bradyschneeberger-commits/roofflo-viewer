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

### Roof-Type Reference Isolation Rule (CRITICAL)

Reference geometry and helper zones must be routed by roofType explicitly.

This includes:
- intake references
- exhaust zones
- ridge references
- helper surfaces
- placement guides

Required:
- each roof type must explicitly define which reference geometries are valid in the current phase
- Hip must not display or inherit gable-style exhaust-zone geometry unless Hip exhaust regions are explicitly defined for that step
- geometry-only phases must not show placeholder zones from unrelated roof types

Prohibited:
- generic fallback reference geometry
- reusing Gable exhaust-zone helpers for Hip
- showing future placement/exhaust surfaces before Hip explicitly defines them

---

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

### Planar Resolution Rule (CRITICAL)

All roof surfaces must be generated from a resolved set of shared vertices before any meshes are created.

Required:
- compute all key roof vertices first (corners, ridge endpoints, apex if applicable)
- define all roof planes using those shared vertices
- ensure all adjoining planes share identical vertex references

Prohibited:
- generating roof planes independently and attempting to align them afterward
- computing ridge or hips separately from roof planes
- deriving apex/ridge after planes are created

Goal:
All roof surfaces meet cleanly with no gaps, overlaps, or floating references.

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

### Shared Boundary Edge Rule (CRITICAL)

Where major roof geometry layers meet, they must share the same exact resolved boundary edges.

This includes the boundary between:
- attic core and intake zone
- intake zone and outer roof shell
- roof planes and ridge/apex references

Required:
- adjoining geometry layers must reuse identical boundary vertices/edges
- the inner perimeter breakline at the building footprint must be solved once and reused by all connected layers
- intake zone must begin from the exact attic-core boundary edge, not an approximated parallel edge

Prohibited:
- solving adjacent layers separately and visually aligning them afterward
- near-matching but non-identical perimeter edges
- small gaps, offsets, or disconnected transitions between roof layers

Goal:
All connected roof layers must meet on shared resolved edges so the roof reads as one continuous assembly.

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

### Explicit Geometry Dimension Rule (CRITICAL)

Each roof type must explicitly define separate geometry dimensions for:

- buildingFootprint
- roofFootprint
- atticCoreProfile
- roofShellProfile

Definitions:
- buildingFootprint = enclosed building width and length only
- roofFootprint = outer roof width and length including valid overhang extents
- atticCoreProfile = the enclosed inner attic shape over the buildingFootprint
- roofShellProfile = the outer roof shape over the roofFootprint

Required:
- atticCore must be built from buildingFootprint + atticCoreProfile
- roofEnvelope must be built from roofFootprint + roofShellProfile
- intakeZones must occupy the space between the atticCore boundary and the roofEnvelope boundary
- atticCore top geometry must resolve to the true enclosed ridge/apex, not a broad platform

Prohibited:
- using one footprint definition for both atticCore and roofEnvelope
- treating the atticCore as a scaled-down roof shell without resolving its own enclosed peak
- allowing atticCore geometry to extend into the overhang/intake perimeter

Goal:
Make the enclosed attic volume and the outer roof shell unambiguous in both code and visuals.

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

### Scene Bounds / Grid Extent Rule

Scene framing helpers must cover the full active roof footprint, including valid overhang extents.

Required:
- grid / ground references must extend to at least the current roofEnvelope bounds
- roof overhangs must not visually hang beyond the intended scene support area
- bounds/framing should be recomputed when roofType or roof dimensions change

Prohibited:
- sizing the grid only to the enclosed building footprint when the visible roof extends farther
- leaving the roof visually outside the supported scene area

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

### Hip Structural Resolution Rule (CRITICAL)

Hip must be solved using both:
- an inner enclosed attic definition
- an outer roof-shell definition

Hip requires:
- inner buildingFootprint for atticCore
- outer roofFootprint for roofEnvelope
- shared roof topology between them
- atticCore surfaces that rise to the true enclosed ridge/apex
- intakeZones occupying the perimeter band between inner and outer boundaries

The atticCore must not keep the same broad top shape as the outer roof shell.
It must resolve as the true inner enclosed attic form.

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
