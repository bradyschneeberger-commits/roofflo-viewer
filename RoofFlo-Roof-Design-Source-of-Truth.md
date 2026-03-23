# RoofFlo V3 — Roof Design Source of Truth

## PURPOSE

Define how all roof types are constructed using a universal system based on:
- Faces
- Edges
- Derived references

This system must work for:
- Gable
- Shed
- Hip
- Future roof types

---

## UNIVERSAL ROOF MODEL

A roof is defined by:

1. Faces (primary planes)
2. Edges (boundaries between faces)
3. Derived relationships (height, slope, intersections)

No roof is defined by zones, references, or attic volumes.

---

## ROOF CONSTRUCTION ORDER (CRITICAL)

1. Construct Faces
2. Derive Edges from Faces
3. Classify Edges
4. Derive Placement References
5. Add Zones (visual only)
6. Generate Attic (last)

Any deviation from this order is invalid.

---

## FACE RULES

- Faces must fully define the roof shape
- Faces must intersect correctly (ridge, hips, etc.)
- Faces must extend to the correct boundaries (eaves)

Examples:
- Gable → 2 faces
- Hip → 4 faces
- Shed → 1 face

---

## EDGE DERIVATION

Edges are created from face boundaries and intersections.

Edge types:

1. Eave Edges
- Lowest perimeter edges
- Where roof meets exterior boundary

2. Ridge Edges
- Highest intersection between faces

3. Hip Edges
- Diagonal intersection between sloped faces

4. Valley Edges (future)
- Inward intersections

---

## EDGE CLASSIFICATION RULES

- Classification must be based on geometry, not naming
- Lowest edges → eaves
- Highest intersections → ridge/apex
- Sloped intersections → hips

---

## PLACEMENT REFERENCES

Derived strictly from edges:

- Intake references → from eave edges
- Exhaust references → from ridge edges (or apex if no ridge)

Rules:
- Must lie directly on geometry
- Must not float above or below surfaces
- Must follow edge direction and position exactly

---

## INTAKE STRATEGY

- Always derived from lowest edges (eaves)
- May be continuous perimeter or segmented
- Must align with underside/eave position

---

## EXHAUST STRATEGY

- If ridge exists → use ridge edges
- If no ridge → use apex point/line

---

## ZONE RULES

- Zones are visual only
- Zones must be derived from references
- Zones must not define placement logic

---

## ATTIC RULES

- Attic is volume under roof faces
- Clipped by building footprint
- Does not affect roof geometry or references

---

## NO FLOATING RULE (CRITICAL)

The following must NEVER occur:

- Ridge line floating above roof
- Intake line floating above/below eave
- Zones detached from surfaces
- References not aligned with edges

---

## NO FALLBACK RULE

If faces are not constructed:
- The system must NOT create a default slab

Failure must be visible, not hidden.

---

## VALIDATION CHECKLIST (PER ROOF)

A roof is valid only if:

1. Faces are constructed correctly
2. Faces intersect correctly
3. Edges are derived from faces
4. Edge types are correctly classified
5. Intake references align with eaves
6. Exhaust references align with ridge/apex
7. No floating elements exist
8. Geometry is not replaced by fallback mesh

---

## CURRENT DEVELOPMENT FOCUS

We are validating:

- Geometry construction
- Edge derivation
- Mesh/render pipeline

We are NOT building:
- new roof types
- advanced features
- attic behavior

Until the above is stable.

---

## IMPLEMENTATION RULE

Each roof type must return:

- faces[]
- edges[]
- classifiedEdges
- placementReferences (derived only)

No roof type may:

- define zones directly
- define placement positions manually
- bypass edge-based derivation

---

## FINAL PRINCIPLE

All behavior must emerge from geometry.

If something cannot be derived from faces and edges,
it does not belong in the system.