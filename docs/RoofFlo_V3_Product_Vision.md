========================================
ROOFFLO V3 — PRODUCT VISION
========================================

Last Updated: 2026-03-23
Scope: Future features, ideas, UX concepts, and product direction

----------------------------------------
CURRENT STAGE
----------------------------------------

- Geometry system: COMPLETE (Gable, Shed, Hip)
- Canonical pipeline: ACTIVE
- Airflow: Legacy system (pending canonical alignment)

----------------------------------------
NEAR-TERM PRIORITIES
----------------------------------------

- Canonical airflow containment
- Vent placement integration across all roof types
- Turbine vent implementation (critical for hip roofs)

----------------------------------------
PARKED IDEAS (FUTURE)
----------------------------------------

### 1. Smart Diagnosis System
- Analyze current roof setup
- Ask follow-up questions (insulation, ice dams, etc.)
- Recommend solutions and products

---

### 2. Conflict Detection System
- Allow incorrect builds (for realism)
- Flag issues:
  - mixed exhaust types
  - intake on rake edges
- Provide warnings with explanations

---

### 3. Savings / Impact Tool
- Compare current vs recommended system
- Show:
  - intake improvement %
  - exhaust improvement %
  - estimated energy savings
- Suggest insulation + air sealing improvements

---

### 4. Vent Quantity Guidance
- Show recommended vent counts on hover
- Show “remaining needed” in real-time
- Align with contractor estimation workflows

---

### 5. Advanced Intake Solutions
- Handle edge cases:
  - no soffit
  - closed eaves
- Suggest products like fascia vents

---

### 6. Reporting & Sales Tools
- Generate visual reports
- Help contractors close jobs
- Translate system improvements into homeowner value

### 7. Parked Idea: Custom Overhang Settings (Per Roof Edge)

### Summary
The current system uses a single global `overhangDepth` applied uniformly to all roof edges. This is a strong default and matches many real-world homes, but it does not account for roofs where overhang dimensions vary by side.

This feature is **parked for future implementation** and is not part of the current active development lane.

---

### Why This Matters
Supporting per-edge overhang values would improve:

- Accuracy of roof geometry representation  
- Correctness of intake and exhaust zone generation  
- Proper handling of shed roofs with high-side overhangs  
- Support for asymmetrical and more complex roof designs  
- Alignment between visual model and real-world construction  

---

### Current Limitation
- Single `overhangDepth` value applies to all edges  
- Overhang is not differentiated by edge type (eave, rake, high side, etc.)  
- Zone logic must currently compensate for this simplification (e.g., excluding exhaust zones from overhang areas)

---

### Future Implementation Direction

Replace:
- Global `overhangDepth`

With:
- Per-edge or edge-classified overhang values driven by roof type

#### Example Targets

- **Gable Roof**
  - Eave overhang
  - Rake overhang

- **Shed Roof**
  - Low-side (eave) overhang
  - High-side overhang
  - Side overhangs (left/right)

- **Hip Roof**
  - Per-edge overhang values OR
  - Edge-classified overhang system

---

### System Impact (Important)

This change must propagate through the entire pipeline:

- Canonical geometry generation  
- Enclosed attic boundary vs outer roof extents  
- Roof zone generation (intake/exhaust)  
- Vent placement constraints  
- Airflow containment and airflow influence systems  

This is not just a UI feature—it is a **core geometry and system architecture expansion**.

---

### Constraints

- Do **not** begin implementation until:
  - Canonical geometry system is stable  
  - Roof zones are correct and reliable  
  - Airflow system is fully aligned and validated  

- Avoid partial implementation (e.g., UI-only or geometry-only changes)

---

### Status
**Parked — Future Phase**

----------------------------------------
LONG-TERM VISION
----------------------------------------

RoofFlo becomes:

- A design tool
- A diagnostic engine
- A sales tool
- A training tool

All driven by:
→ geometry-based truth
→ real-world ventilation logic

----------------------------------------
END OF DOCUMENT
----------------------------------------