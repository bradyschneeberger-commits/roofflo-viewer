# RoofFlo V3 — Source of Truth

## PURPOSE
RoofFlo is an interactive 3D ventilation visualization and sales tool designed to help roofing professionals explain attic airflow and recommend proper ventilation systems to homeowners.

The system is built for:
- Visual education
- Sales presentation
- Scenario comparison
- Report generation (future phase)

---

## CORE PRINCIPLES

- 1 unit = 1 foot (Three.js scale)
- Ridge is always centered
- Intake = eaves (lower roof edges)
- Exhaust = ridge or high roof placement
- Simulation is visual + educational (not CFD accurate)
- Users can build incorrect systems (we warn, not block)
- Viewer is state-driven (snapshot-based)

---

## SYSTEM ARCHITECTURE

### Viewer Model
RoofFlo uses a **single viewer architecture**.

- One Three.js scene
- Snapshots load into the same viewer
- No multi-viewer system
- Viewer acts as a **state renderer**, not a static scene

---

## CURRENT SYSTEM STATE

### GEOMETRY
- Dynamic attic geometry
- Pitch controls height
- Intake plenums present
- Ridge centered

### VENT SYSTEM
- Intake vents (snap to eaves)
- Static vents (single slope constraint)
- Ridge vents (continuous, dual-side visualization)

### PLACEMENT SYSTEM
- Placement modes:
  - Intake
  - Static
  - Ridge
- Snap alignment enabled
- Clean placement behavior

### CALCULATIONS
- NFVA based
- Required vs installed
- Intake / exhaust split
- Status detection:
  - Under-ventilated
  - Intake deficient
  - Exhaust deficient
  - Balanced

### AIRFLOW SYSTEM
- Particle-based simulation
- Stale air baseline
- Fresh air introduction via intake
- Exhaust removal behavior
- Ridge deflection behavior implemented
- Performance stabilized

---

## SNAPSHOT SYSTEM (NEW CORE FEATURE)

### Concept
Snapshots represent **viewer states**, not images.

Each snapshot includes:
- Geometry inputs
- Vent layout
- Ventilation rule
- Metadata (optional)

Snapshots:
- Can be saved
- Can be restored
- Rebuild the full viewer state
- Can run simulation

### Purpose
Snapshots act as:
- Presentation slides
- Scenario states
- Report building blocks

---

## SNAPSHOT STRIP (BUILD MODE)

- Bottom bar displays saved snapshots
- Each snapshot is selectable
- Active snapshot loads into viewer
- Supports:
  - Add snapshot
  - Select snapshot
  - Reorder (basic)
  - Delete

This is the foundation of:
- Presentation mode
- Report workflow
- Bubble integration

---

## CURRENT UI (TRANSITION STATE)

### Existing Layout (Being Replaced)
- Left control panel
- Right results panel
- Top toolbar (text buttons)
- Bottom snapshot bar (new)

---

## NEXT PHASE — WORKSPACE REFACTOR

### TARGET UI MODEL

#### Top Action Bar (Icon-Based)
- Start Simulation
- Reset
- Grid Toggle
- Save Snapshot
- Results

#### Bottom Tool Panel (Unified Panel)
Tabbed system:
- Setup
- Vent Placement
- Presets (Snapshots later)

Mobile-style:
- Slide-up / drawer behavior
- Used across desktop + mobile

#### Viewer Area
- Primary focus
- Clean, unobstructed
- Central to experience

#### Snapshot Strip
- Remains at bottom
- Works with new layout
- Acts as slide builder

---

## PRODUCT WORKFLOW (TARGET)

### Build Mode
- User configures system
- Saves snapshots
- Builds sequence of scenarios

### Preview Mode (NEXT)
- User reviews snapshots in order
- Viewer loads each state
- Minimal editing UI

### Present Mode (FUTURE)
- Homeowner-facing experience
- Clean UI
- Guided storytelling

---

## PRODUCT DIRECTION

RoofFlo is NOT:
- a full roofing CRM
- a measurement tool
- a replacement for Roofr

RoofFlo IS:
- a ventilation visualization engine
- a sales presentation tool
- a scenario comparison system

---

## DEVELOPMENT PHASES

### Phase A — Core System (COMPLETE)
- Geometry
- Vent placement
- Calculations
- Airflow simulation

### Phase B — Simulation + UX Stability (COMPLETE)
- Airflow refinement
- Performance improvements
- Visual clarity improvements

### Phase C — Sales System Layer (CURRENT)

#### C1 — Workspace UI Refactor (IN PROGRESS)
- Replace side panels
- Add bottom tool panel
- Convert toolbar to icon-based
- Clean viewer focus

#### C2 — Snapshot Workflow Expansion
- Labeling
- Ordering improvements
- Slide behavior

#### C3 — Preview Mode
- Non-edit viewing
- Snapshot playback

#### C4 — Presentation Mode
- Clean UI
- Guided experience
- Homeowner-ready

---

## FUTURE PHASES

### Phase D — App Integration
- Bubble workspace connection
- Slide builder inside app
- Report creation

### Phase E — Sharing & Reports
- Share links
- PDF generation
- Client-facing outputs

### Phase F — Expansion
- Additional roof types (hip, etc.)
- More vent systems
- Manufacturer integrations

---

## KEY PRINCIPLE MOVING FORWARD

RoofFlo is now:
> A state-driven visual presentation engine

NOT:
> A simple interactive viewer