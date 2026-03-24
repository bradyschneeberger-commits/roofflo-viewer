========================================
ROOFFLO V3 — ROOF DESIGN SOURCE OF TRUTH
========================================

----------------------------------------
PURPOSE
----------------------------------------

Define how all roof types are constructed using a universal, geometry-first system based on:

- Faces (primary surfaces)
- Edges (relationships between faces)
- Derived structures (classification, references, zones)

This system must support:
- Gable
- Shed
- Hip
- All future roof types

----------------------------------------
CORE PRINCIPLE
----------------------------------------

All behavior must emerge from geometry.

If something cannot be derived from:
- faces
- edges

it does not belong in the system.

----------------------------------------
UNIVERSAL ROOF MODEL
----------------------------------------

A roof is defined by:

1. Faces (planar surfaces)
2. Edges (boundaries + intersections)
3. Derived relationships (height, slope, adjacency)

A roof is NOT defined by:
- zones
- placement
- airflow
- attic volumes

These are downstream systems.

----------------------------------------
ROOF CONSTRUCTION ORDER (CRITICAL)
----------------------------------------

This order is mandatory:

1. Construct Faces
2. Derive Edges from Faces
3. Classify Edges
4. Build References from Edges
5. Build Zones from References (visual only)
6. Build Attic (last)

Any deviation from this order is invalid.

----------------------------------------
FACE RULES
----------------------------------------

- Faces must fully define the roof geometry
- Faces must be planar
- Faces must intersect correctly (ridge, hip, etc.)
- Faces must extend to correct boundaries (eaves)

Examples:
- Gable → 2 faces
- Hip → 4 faces
- Shed → 1 face

----------------------------------------
EDGE DERIVATION
----------------------------------------

Edges are derived exclusively from face boundaries and intersections.

Edge types:

1. Eave
- Lowest perimeter edges
- Roof-to-exterior boundary

2. Ridge
- Highest horizontal shared edges

3. Hip
- Sloped shared edges between faces

4. Rake
- Sloped perimeter edges

5. HighEdge (shed-specific)
- Elevated perimeter edge with no opposing face

6. Valley (future)
- Inward intersections

----------------------------------------
EDGE CLASSIFICATION RULES
----------------------------------------

- Must be geometry-driven (no roof-type conditionals)
- Based on:
  - height
  - slope
  - shared vs perimeter

Rules:
- lowest horizontal perimeter → eave
- highest shared horizontal → ridge
- sloped shared → hip
- sloped perimeter → rake
- elevated perimeter (no shared face) → highEdge

----------------------------------------
PLACEMENT REFERENCES
----------------------------------------

Derived strictly from classified edges.

Mappings:

- Intake → eave
- Ridge → ridge
- Exhaust → ridge + highEdge

Rules:
- Must lie exactly on geometry
- Must follow edge direction precisely
- Must not be offset, approximated, or interpolated

----------------------------------------
INTAKE STRATEGY
----------------------------------------

- Always derived from eave edges
- May be continuous or segmented
- Must align with true intake location (low edge)

----------------------------------------
EXHAUST STRATEGY
----------------------------------------

- If ridge exists → use ridge edges
- If no ridge → use highEdge or apex equivalent

----------------------------------------
ZONES
----------------------------------------

- Zones are visual overlays only
- Zones must be derived from references
- Zones must not control placement logic

----------------------------------------
ATTIC
----------------------------------------

- Defined as volume beneath roof faces
- Clipped by building footprint
- Must NOT influence:
  - geometry
  - edges
  - references

----------------------------------------
NO FLOATING RULE (CRITICAL)
----------------------------------------

The following must NEVER occur:

- ridge lines above roof surface
- intake lines not on eave edges
- zones detached from surfaces
- references offset from geometry

----------------------------------------
NO FALLBACK RULE
----------------------------------------

If faces fail to construct:

- system must NOT generate fallback geometry
- failure must be visible and debuggable

----------------------------------------
VALIDATION CHECKLIST (PER ROOF)
----------------------------------------

A roof is valid only if:

1. Faces are correct and complete
2. Faces intersect correctly
3. Edges are derived (not manually defined)
4. Edges are correctly classified
5. Intake aligns with eaves
6. Exhaust aligns with ridge/highEdge
7. No floating geometry exists
8. No fallback geometry is used

----------------------------------------
IMPLEMENTATION CONTRACT
----------------------------------------

Each roof type must return:

- faces[]
- edges[] (derived)
- classifiedEdges
- references (derived only)

Roof types must NOT:

- define zones
- define placement logic
- define airflow behavior
- inject manual overrides

----------------------------------------
CANONICAL ALIGNMENT RULE (NEW)
----------------------------------------

All downstream systems must consume canonical geometry.

This includes:
- airflow containment
- vent placement
- zone visualization
- diagnostics

No system may:
- re-derive roof shape independently
- use analytic approximations that conflict with faces

----------------------------------------
COORDINATE SYSTEM RULE (NEW)
----------------------------------------

All geometry must share a consistent coordinate space:

- origin aligned to building center
- X = width axis
- Z = length axis
- Y = height

All derived systems must operate in this same space.

----------------------------------------
CONTINUITY RULE (NEW)
----------------------------------------

Edges that represent continuous real-world features must remain continuous:

- ridge lines must not fragment
- eaves must remain consistent across faces
- references must maintain continuity across segments

----------------------------------------
CURRENT DEVELOPMENT FOCUS
----------------------------------------

We have completed:

- canonical geometry pipeline
- gable, shed, hip integration

We are now working on:

- canonical airflow alignment

We are NOT currently working on:
- new roof types
- advanced UI features
- attic simulation behavior

----------------------------------------
FINAL PRINCIPLE
----------------------------------------

Geometry is the source of truth.

All other systems must follow it — never redefine it.

----------------------------------------
END OF SOURCE
----------------------------------------