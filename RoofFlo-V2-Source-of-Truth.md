# RoofFlo V2 — Source of Truth

This document is a compact project source you can keep in the repo so the build plan, architecture, rules, and prompts do not get lost if the chat crashes.

---

## 1. Project Goal

RoofFlo V2 is a clean rebuild of the ventilation proof of concept.

The goal is to build a viewer that can:
- generate a roof-envelope-based attic model
- place intake, static, and ridge vents correctly
- calculate required and installed ventilation
- simulate airflow through the overhang intake zones, attic space, and exhaust vents

This version should stay modular, visually clean, and easy to debug.

---

## 2. Global Rules

- **1 Three.js unit = 1 foot**
- All geometry is modeled internally in feet
- Inches must be converted to feet before being used in geometry
- The ridge stays centered for the gable model
- The **attic floor area** is based on the **building footprint only**
- The **roof envelope** is based on **building width + overhangs**
- The blue intake zones stay **inside the roof envelope**
- The green attic volume stays **over the building footprint only**
- POC airflow should be physically believable, not full CFD

---

## 3. Geometry Model

### Core idea
Build the geometry like a roof is actually constructed:

1. Build the **roof envelope** from:
   - building width
   - overhang depth on both sides
   - roof pitch
   - building length

2. Build the **main attic space** from:
   - building width
   - building length
   - constrained by the roof envelope

3. Fill the overhang-side lower regions under the roof with **blue intake zones**.

### Geometry meaning
- **Green attic volume** = main attic air space above the building footprint
- **Blue intake zones** = overhang-side connected intake path under the roof

### POC geometry simplification
For the POC, the blue intake zone can remain the **full wedge under the overhang**, rather than a true 4-inch channel.

That choice was made to keep airflow containment easier in the short term. fileciteturn1file0

### Key geometry relationships
- `roofWidth = buildingWidth + (2 * overhangDepth)`
- `halfBuildingWidth = buildingWidth / 2`
- `atticHeight = (pitchRise / 12) * halfBuildingWidth`

### Current geometry ownership
`modules/geometry.js` should own:
- `atticSystem`
- `roofEnvelope`
- `atticCore`
- `leftPlenum`
- `rightPlenum`
- `atticHeight`

Use a single `atticSystem` group so geometry can be rebuilt cleanly.

---

## 4. Input Panel

The V2 input panel should include:

- **House Width** (feet)
- **House Length** (feet)
- **Roof Pitch** as `[input] / 12`
- **Overhang Depth** (inches)
- **Ventilation Rule** dropdown:
  - `1/150`
  - `1/300`

Why pitch instead of attic height:
- contractors think in pitch, not attic height
- attic height is derived from width and pitch
- ridge remains centered automatically

The geometry must rebuild dynamically when:
- width changes
- length changes
- pitch changes
- overhang changes

That input-driven rebuild behavior was defined in the revised Step 3 plan. fileciteturn1file0

---

## 5. Vent Types and Placement Rules

### Intake Vent
For V2:
- place on the **bottom/underside** of the blue intake zone
- centered on the intake placement line
- run **parallel to the eaves only**
- do **not** include the perpendicular orientation option in V2

### Static Exhaust Vent
For V2:
- one static exhaust type only
- opening size = **9" x 9"**
- placed only in the upper exhaust zone

### Ridge Vent
For V2:
- click once to set the **start point**
- click again to set the **end point**
- both points snap to the **ridge centerline**
- ridge vent width = **2 inches**

This click-start / click-end ridge vent workflow replaced the earlier drag idea because it is simpler and more controlled.

---

## 6. Placement References / Zones

Step 4 defined five placement references:
- `leftIntakePlacement`
- `rightIntakePlacement`
- `leftExhaustZone`
- `rightExhaustZone`
- `ridgeCenterLine`

### Intake Placement References
- sit on the **underside** of the blue intake zones
- run parallel to the eaves / house length
- used later for intake vent snapping

### Static Exhaust Zones
- one on each roof slope
- start at the ridge
- extend **36 inches downslope**
- 36 inches = **3 feet** in scene units
- sit flush on the roof surface
- run full building length

That Step 4 requirement was explicitly defined in the project notes. fileciteturn1file1turn1file2

### Ridge Center Line
- visible line at the roof peak
- runs along the Z axis / house length
- used for ridge vent snapping

### Important fix note
The exhaust zone should **not** be a free-floating box rotated in world space. It must follow the actual roof slope and extend exactly 3 feet downslope from the ridge. fileciteturn1file2

---

## 7. NFVA Assumptions for the POC

Use these standard/common values for now:

- **Soffit intake vent** = `50 in² each`
- **Static vent** = `50 in² each`
- **Ridge vent** = `18 in² per linear foot`

These are temporary/common values for the POC and can later be replaced with manufacturer-specific products.

Long-term product direction:
- allow manufacturers to contribute specialized vent products
- allow users to place real branded vent models with true NFVA values

---

## 8. Calculations / Results Panel

The results panel should show:
- Attic Area
- Ventilation Rule
- Required Ventilation
- Required Intake
- Required Exhaust
- Installed Intake
- Installed Exhaust
- Intake Difference
- Exhaust Difference
- Status

Possible statuses:
- Balanced
- Intake Deficient
- Exhaust Deficient
- Under-ventilated

### Calculation basis
- attic floor area = `buildingWidth * buildingLength`
- overhangs do **not** count toward attic area

---

## 9. Simulation Controls

The V2 control system should be simplified.

### Buttons
- `Intake Vent`
- `Static Vent`
- `Ridge Vent`
- `Start Simulation`
- `Reset`

### Reset behavior
Reset should:
- stop airflow simulation
- clear all particles
- clear all placed vents
- return viewer to a clean state

This Reset approach replaced the earlier undo/delete idea because it is cleaner for the POC.

### Simulation lock
While simulation is running:
- vent placement should be disabled

---

## 10. Airflow Design (V2)

### Core rule
Particles must stay contained inside:
- left intake zone
- right intake zone
- main attic space

Particles may only leave through a **real placed exhaust vent**.

### Particle phases
1. **Intake phase**
   - spawn at placed intake vents
   - enter through the blue intake zone

2. **Attic phase**
   - move inward and upward through the green attic space
   - steer toward the nearest valid exhaust vent

3. **Exhaust phase**
   - pass through the nearest valid exhaust vent
   - remain visible briefly after exit
   - float upward a little
   - then disappear/reset

### Continuous simulation
- `Start Simulation` begins continuous emission
- airflow continues until `Reset` is pressed

### If no exhaust exists
- particles may still rise and circulate in the attic
- but should not leave through the roof

### POC simplification
Use **zone-guided airflow**, not full collision-based CFD.

---

## 11. File Responsibilities

### `index.html`
- HTML structure only
- import map
- control panel container
- results panel container
- viewer canvas
- load `main.js`

### `main.js`
- application controller
- initialize scene
- initialize geometry
- wire inputs
- rebuild geometry on input change
- manage simulation state
- run animation loop

### `modules/scene.js`
- scene
- camera
- renderer
- controls
- lighting
- helpers
- resize handling

### `modules/geometry.js`
- roof-envelope-based geometry system
- attic core
- left/right intake zones
- placement references and zones
- ridge line reference
- rebuild logic through `createAtticGeometry(params)`

### `modules/vents.js`
- vent placement modes
- intake vent placement
- static vent placement
- ridge vent placement
- clear/reset vent arrays

### `modules/calculations.js`
- NFVA calculations
- required vs installed ventilation
- status output

### `modules/airflow.js`
- start simulation
- stop/reset simulation
- particle spawning
- zone-based particle updates
- exhaust targeting

### `styles/style.css`
- control panel styling
- results panel styling
- general viewer layout

---

## 12. Current Build Order

### Step 1 — Viewer foundation
Completed:
- viewer works
- orbit controls work
- no console errors

### Step 2 — Geometry foundation
Completed / largely correct:
- roof envelope built from building width + overhangs
- attic space constrained by roof envelope
- blue intake zones inside roof envelope
- transparency and edge outlines added

### Step 3 — Input panel and dynamic rebuild
Completed:
- left-side input panel works
- geometry rebuilds from width/length/pitch/overhang changes
- ventilation rule stored for later

That revised Step 3 scope and test checklist were documented in the project notes. fileciteturn1file0

### Step 4 — Placement references / zones
In progress:
- intake references
- ridge center line
- static exhaust zones
- current known issue: **exhaust zone alignment still needs refinement**

The intended Step 4 scope and the exhaust-zone correction guidance were documented in the notes. fileciteturn1file1turn1file2

---

## 13. Latest Known Issue

### Exhaust zone alignment
The static exhaust zones should:
- start at the ridge
- sit flush on the roof surface
- extend exactly **3 feet downslope**
- be symmetrical left/right
- run full house length

The current wrong behavior seen earlier was:
- zone rotated incorrectly
- zone cutting through space instead of sitting on the roof
- orientation likely using world axes instead of roof-slope logic

Required fix:
- derive roof angle from `Math.atan(pitchRise / 12)`
- build each zone from the ridge outward/down the slope
- use opposite slope directions for left/right

That exact fix direction came out of the project notes. fileciteturn1file2

---

## 14. Recommended Code Pattern for Geometry

Use this pattern in `geometry.js`:

```js
let atticSystem = null;

function createAtticGeometry(params = {}) {
  if (atticSystem) {
    scene.remove(atticSystem);
  }

  atticSystem = new THREE.Group();
  scene.add(atticSystem);

  // build roofEnvelope
  // build atticCore
  // build leftPlenum
  // build rightPlenum
  // build placement helpers

  return {
    atticSystem,
    atticCore,
    leftPlenum,
    rightPlenum
  };
}
```

This keeps rebuilds clean and prevents duplication.

---

## 15. Suggested Repo File to Keep

Recommended filename:

`PROJECT_SOURCE_OF_TRUTH.md`

or

`RoofFlo-V2-Source-of-Truth.md`

Keep this in the root of the repo so:
- the VS Code agent can read it
- future prompts can reference it
- project intent doesn’t get lost when chat history gets unstable

---

## 16. Next Immediate Task

Fix Step 4 exhaust zones so they:
- lie flush on the roof
- start at ridge
- extend 3 feet downslope
- stay symmetrical

After that:
- Step 5 = vent placement
- Step 6 = calculations panel
- Step 7 = airflow

---

## 17. Quick Prompt Reference

### Step 3 summary
Add input panel + dynamic geometry rebuild using:
- width
- length
- pitch
- overhang
- ventilation rule

### Step 4 summary
Create:
- left/right intake placement references
- left/right exhaust zones
- ridge center line

### Step 4 exhaust fix summary
Fix exhaust zones to be roof-aligned, ridge-based, and 3 feet downslope. fileciteturn1file2

---

## 18. POC Decisions Locked In

- scale = 1 unit = 1 foot
- roof pitch input = `[rise] / 12`
- overhang depth entered in inches
- attic area based on building width x building length only
- wedge-style blue intake zones are acceptable for the POC
- intake vents run parallel to eaves only
- static vent opening size = 9" x 9"
- ridge vent width = 2"
- static exhaust zone extends 36" down from ridge
- simulation uses Start / Reset, not delete/undo

---

## 19. Long-Term Direction

The real product opportunity is manufacturer-specific vents.

Future versions can support:
- manufacturer vent libraries
- product-specific NFVA values
- product-specific vent geometry
- real placement of branded vent models inside the scene

The POC uses standard/common NFVA values only to keep development moving.

---

## 20. Final Reminder

When in doubt, prefer:
- simple
- modular
- physically believable
- easy to debug
- consistent with roof construction logic

Do not reintroduce the V1 pattern of separate floating intake boxes or generic particle movement outside the geometry.
