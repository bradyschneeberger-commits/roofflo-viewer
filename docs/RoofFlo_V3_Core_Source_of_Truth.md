========================================
ROOFFLO V3 — CORE SOURCE OF TRUTH
========================================

Last Updated: 2026-03-26  
Scope: System architecture, principles, and development guardrails

----------------------------------------
PURPOSE
----------------------------------------

RoofFlo is a roof ventilation simulation and visualization system that allows users to:

- Construct roof geometries
- Place ventilation components
- Visualize airflow behavior
- Demonstrate correct vs incorrect ventilation setups

The system must be:
- Visually accurate
- Physically intuitive
- Architecturally scalable across all roof types

----------------------------------------
CORE PRINCIPLES
----------------------------------------

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

----------------------------------------
SYSTEM LAYERS
----------------------------------------

### 1. Geometry Layer (FOUNDATION)

Responsible for:
- Constructing all canonical roof enclosure faces
- Defining vertices and edges

Face Types:
- Exterior roof faces (weather-facing)
- Underside / soffit faces (overhang underside)
- End-cap enclosure faces (gable/shed closures above building)

Rules:
- Geometry must fully represent the roof enclosure above the building footprint
- All faces must be constructed BEFORE edge derivation
- Faces define the system — not zones, references, or airflow
- No placeholder or fallback meshes allowed

---

### 2. Edge Classification Layer

Responsible for:
- Identifying edge types from geometry

Edge Types:

- Eave edges (boundary between exterior roof faces and soffit faces)  
- Ridge edges (highest shared horizontal edges between roof faces)  
- Hip edges (sloped shared edges between roof faces)  
- Rake edges (sloped perimeter edges on gable ends)  
- HighEdge (elevated perimeter edge with no opposing face — shed behavior)  
- Valley edges (future support)

Rules:
- Edges must be derived from ALL face boundaries
- Classification must be geometry + relationship driven
- No hardcoded roof-type assumptions

---

### 3. Placement Reference Layer

Responsible for:
- Creating vent placement references from classified edges

Rules:

- Intake references = derived from eave edges  
- Exhaust references = derived from ridge edges and valid exhaust-capable edges  
- References must lie directly on geometry  
- References must follow exact edge direction  
- No floating or offset references allowed  

---

### 4. Zone Layer (VISUAL ONLY)

Responsible for:
- Displaying recommended placement regions

Rules:
- Zones are visual guides only  
- Zones must be derived from placement references  
- Zones must not define placement logic  
- Zones must exist on the authoritative placement surface for that vent type  

---

### 5. Attic Layer (DERIVED LAST)

Responsible for:
- Filling volume beneath roof geometry

Rules:
- Attic is derived from roof enclosure geometry  
- Attic must never influence roof shape  
- Attic must remain contained within building footprint  

---

----------------------------------------
CAPABILITY SYSTEM
----------------------------------------

Each roof type defines capabilities:

- hasRidge  
- hasEaves  
- hasHips  
- hasValleys  
- intakeStrategy (eave-based)  
- exhaustStrategy (ridge-based, highEdge/apex-based)  

Rules:
- Behavior must be driven by capabilities, not roof type names  
- No hardcoded “if hip do this” logic  

---

----------------------------------------
PLACEMENT RULES
----------------------------------------

Authoritative Placement Surfaces:

- Intake → underside/soffit faces derived from eave edges  
- Exhaust → exterior roof faces  

Rules:

- Intake vents must snap to intake references and resolve onto soffit surfaces  
- Exhaust vents must snap to exhaust references and resolve onto roof faces  
- Placement must be deterministic and aligned  
- No free-floating placement  

---

----------------------------------------
VISUAL RULES
----------------------------------------

- All geometry must be continuous and connected  
- No floating lines or elements  
- Ridge must sit on actual roof geometry  
- Intake placement must align with the soffit/underside surface  
- Zones must visually match actual placement surfaces  

---

----------------------------------------
TERMINOLOGY (STRICT)
----------------------------------------

- Roof Geometry = faces + edges (canonical enclosure geometry)  
- Faces = all planar enclosure surfaces (exterior, underside, end-cap)  
- Edges = boundaries between faces  
- References = placement lines derived from edges  
- Zones = visual overlays only  

Allowed:
- "roof enclosure" (canonical geometry)

---

----------------------------------------
CANONICAL ALIGNMENT RULE
----------------------------------------

All downstream systems must consume canonical geometry.

This includes:
- airflow containment  
- vent placement  
- zone visualization  
- diagnostics  

No system may:
- re-derive roof shape independently  
- use analytic approximations that conflict with canonical faces  

---

----------------------------------------
DEVELOPMENT MODE RULE
----------------------------------------

During development:

- Only modify one system layer at a time  
- If geometry is not visually correct → STOP  
- Do not proceed to references, zones, or attic until geometry is correct  

---

----------------------------------------
FAILURE CONDITIONS
----------------------------------------

The system is considered broken if:

- Roof renders incorrectly or incompletely  
- Geometry is not fully enclosed above the building footprint  
- Intake placement does not align with soffit surfaces  
- Edges are misclassified or missing  
- Any fallback geometry is used  

---

----------------------------------------
CURRENT PRIORITY
----------------------------------------

Geometry system upgrade to closed roof-shell model

Next:
- Align placement with authoritative surfaces  
- Then: canonical airflow integration  

---

----------------------------------------
FINAL PRINCIPLE
----------------------------------------

Geometry is the source of truth.

All other systems must follow it — never redefine it.

----------------------------------------
END OF SOURCE
----------------------------------------