# RoofFlo V3 — Core Source of Truth

## PURPOSE

RoofFlo is a roof ventilation simulation and visualization system that allows users to:
- Construct roof geometries
- Place ventilation components
- Visualize airflow behavior
- Demonstrate correct vs incorrect ventilation setups

The system must be:
- Visually accurate
- Physically intuitive
- Architecturally scalable across all roof types

---

## CORE PRINCIPLES

1. Geometry First
All systems must derive from actual constructed geometry.
No system may define or override geometry.

2. Visual Truth
What the user sees must reflect real geometry and placement.
No fake positioning or detached elements.

3. Deterministic Behavior
Same inputs must always produce the same geometry and placement.

4. Layer Separation
Each system layer must be independent and build in order:
- Geometry
- Edge Classification
- Placement References
- Zones (visual only)
- Attic (derived last)

5. No Hidden Fallbacks
If a system fails, it must fail visibly.
No silent fallback geometry (e.g., flat slabs).

---

## SYSTEM LAYERS

### 1. Geometry Layer (FOUNDATION)
Responsible for:
- Constructing roof faces (planes)
- Defining vertices and edges

Rules:
- Faces define the roof, not zones or references
- Geometry must fully represent the roof shape
- No placeholder or fallback meshes allowed

---

### 2. Edge Classification Layer
Responsible for:
- Identifying edge types from geometry

Edge Types:
- Eave edges (lowest perimeter edges)
- Ridge edges (highest intersection edges)
- Hip edges (diagonal intersections between faces)
- Valley edges (future support)

Rules:
- Edges must be derived from faces
- No hardcoded edge assumptions

---

### 3. Placement Reference Layer
Responsible for:
- Creating vent placement lines from edges

Rules:
- Intake references = derived from eave edges only
- Exhaust references = derived from ridge edges only
- References must lie directly on geometry
- No floating references allowed

---

### 4. Zone Layer (VISUAL ONLY)
Responsible for:
- Displaying recommended placement regions

Rules:
- Zones are visual guides only
- Zones must not define geometry or references
- Zones must align with actual geometry surfaces

---

### 5. Attic Layer (DERIVED LAST)
Responsible for:
- Filling volume beneath roof geometry

Rules:
- Attic is derived from roof faces
- Attic must never influence roof shape
- Attic must remain contained within building footprint

---

## CAPABILITY SYSTEM

Each roof type defines capabilities:

- hasRidge
- hasEaves
- hasHips
- hasValleys
- intakeStrategy (eave-based, perimeter-based)
- exhaustStrategy (ridge-based, apex-based)

Rules:
- Behavior must be driven by capabilities, not roof type names
- No hardcoded “if hip do this” logic

---

## PLACEMENT RULES

- Intake vents must snap to intake references (eave-derived)
- Exhaust vents must snap to exhaust references (ridge/apex-derived)
- Placement must be deterministic and aligned
- No free-floating placement

---

## VISUAL RULES

- All geometry must be continuous and connected
- No floating lines or elements
- Ridge must sit on actual roof geometry
- Intake lines must sit at the lowest edge of roof surfaces

---

## TERMINOLOGY (STRICT)

- Roof Geometry = faces + edges (actual mesh)
- Faces = roof planes
- Edges = boundaries of faces
- References = placement lines derived from edges
- Zones = visual overlays only

Forbidden ambiguous terms:
- shell
- skeleton
- envelope (unless explicitly defined as geometry)

---

## DEVELOPMENT MODE RULE

During development:

- Only modify one system layer at a time
- If geometry is not visually correct → STOP
- Do not proceed to references, zones, or attic until geometry is correct

---

## FAILURE CONDITIONS

The system is considered broken if:

- Roof renders as a flat slab
- Ridge appears detached or floating
- Intake references are not on lowest edges
- Geometry is not constructed from faces
- Any fallback geometry is used

---

## CURRENT PRIORITY

Fix and validate:
Geometry → Mesh Construction → Render Path

No new roof types or features until this is stable.