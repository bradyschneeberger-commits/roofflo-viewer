# RoofFlo V2 Architecture

## Purpose
RoofFlo V2 is a clean rebuild of the ventilation proof of concept.

This version is designed to:
- generate a connected attic airflow geometry
- place intake, static, and ridge vents cleanly
- calculate ventilation requirements and installed ventilation
- simulate airflow particles through the attic in a controlled way

The goal of V2 is to keep geometry, vent placement, calculations, airflow, and UI responsibilities clearly separated.

---

## Global Rules

- 1 Three.js unit = 1 foot
- All geometry is modeled internally in feet
- Inches must be converted to feet before use in geometry
- Roof ridge is always centered for the gable model
- Geometry should be generated programmatically, not imported from external 3D files
- V2 should stay modular and easy to debug
- Do not combine unrelated logic into one file

---

## File Responsibilities

### index.html
Purpose:
- load the app
- define the import map
- create the main UI structure
- contain the viewer canvas
- contain the control panel and results panel containers

Rules:
- should not contain business logic
- should not contain geometry logic
- should only load `main.js` as the application entry

---

### main.js
Purpose:
- application controller
- initialize modules
- connect UI to the scene, geometry, vents, calculations, and airflow systems
- run the animation loop
- manage simulation state

Responsibilities:
- initialize scene
- initialize geometry
- wire up UI inputs
- handle simulation start/reset state
- update calculations/results
- call airflow update during animation

Rules:
- do not contain geometry creation logic
- do not contain vent placement logic
- do not contain airflow implementation details
- only orchestrate modules

Simulation States:
- IDLE
- RUNNING
- RESET

---

### modules/scene.js
Purpose:
- create and manage the Three.js scene environment

Responsibilities:
- create scene
- create camera
- create renderer
- create OrbitControls
- add lighting
- add grid helper
- add axes helper
- handle resize behavior

Exports:
- scene
- camera
- renderer
- controls

Rules:
- do not create attic geometry here
- do not create vents here
- do not create airflow logic here
- do not perform ventilation calculations here

---

### modules/geometry.js
Purpose:
- generate the connected attic airflow geometry

Responsibilities:
- create the main attic core volume
- create the left intake plenum
- create the right intake plenum
- calculate attic height from roof pitch
- convert inch-based dimensions to feet for geometry use
- create placement zone geometry references as needed

Geometry Model:
- green attic core
- blue left intake plenum
- blue right intake plenum
- all visually connected as one airflow path

Core Inputs:
- houseWidth
- houseLength
- pitchRise
- overhangDepth
- plenumHeight

Derived Values:
- atticHeight

Rules:
- ridge must always stay centered
- use programmatic geometry only
- keep attic core and intake plenums as separate meshes for easier coloring and airflow control
- do not place vents here
- do not simulate airflow here

Exports:
- attic core mesh
- intake plenum meshes
- geometry parameters
- placement references as needed

---

### modules/vents.js
Purpose:
- handle vent placement and vent geometry

Vent Types:
- Intake Vent
- Static Exhaust Vent
- Ridge Vent

Responsibilities:
- manage active vent placement mode
- place intake vents
- place static exhaust vents
- place ridge vents
- clear all placed vents on reset
- expose vent arrays for calculations and airflow targeting

Vent Rules:
- intake vents attach to the bottom face of intake plenums
- intake vents are centered on the intake placement line
- intake vents run parallel to the eaves only
- static vents are placed only within the exhaust zone
- static exhaust zone extends 36 inches downslope from the ridge
- ridge vent placement is click once for start, click once for end
- ridge vent start and end points must snap to ridge centerline
- ridge vent width = 2 inches

Reset Rule:
- reset clears all vents and placement state

Rules:
- do not calculate ventilation requirements here
- do not manage airflow particles here
- do not create scene/camera/renderer here

Exports:
- vent arrays
- placement functions
- reset/clear functions
- mode/state helpers as needed

---

### modules/calculations.js
Purpose:
- calculate required and installed ventilation values

Responsibilities:
- calculate attic floor area
- calculate required ventilation from selected rule
- split required ventilation into intake and exhaust
- calculate installed intake ventilation
- calculate installed exhaust ventilation
- compare required vs installed values
- produce status output for the results panel

NFVA Assumptions for V2:
- soffit intake vent = 50 in² each
- static vent = 50 in² each
- ridge vent = 18 in² per linear foot

Ventilation Rules:
- 1/150
- 1/300

Rules:
- do not create geometry here
- do not place vents here
- do not simulate particles here
- calculations must stay independent and reusable

Exports:
- calculation functions
- status helpers as needed

---

### modules/airflow.js
Purpose:
- simulate attic airflow using particles

Responsibilities:
- spawn airflow particles from intake vents
- keep particles contained inside allowed airflow zones
- move particles through intake plenum, attic core, and exhaust
- stop and clear particles on reset
- update particle positions every animation frame

Airflow Rules:
- particles spawn only from placed intake vents
- particles remain contained inside:
  - left intake plenum
  - right intake plenum
  - attic core
- particles may only leave through placed exhaust vents
- after exiting, particles remain visible briefly, rise, then disappear
- if no exhaust vents exist, particles rise and circulate but do not leave the roof

Particle Phases:
- intake/plenum phase
- attic phase
- exhaust exit phase

Simulation Controls:
- Start Simulation = begin continuous flow
- Reset = stop simulation and clear particles

Rules:
- do not place vents here
- do not calculate ventilation requirements here
- do not rebuild geometry here

Exports:
- startSimulation()
- stopSimulation()
- resetSimulation()
- updateAirflow()

---

### styles/style.css
Purpose:
- style the viewer and UI

Responsibilities:
- layout control panel
- layout results panel
- style buttons, inputs, and labels
- keep viewer readable and demo-friendly

Rules:
- do not put logic here
- keep styles organized and minimal

---

## Planned User Inputs

The V2 input panel will support:

- House Width (feet)
- House Length (feet)
- Roof Pitch (rise over 12)
- Overhang Depth (inches)
- Ventilation Rule (1/150 or 1/300)

These inputs should drive geometry regeneration and calculations.

---

## Planned Results Panel

The V2 results panel should show:

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

---

## Planned Control Panel

The V2 control panel should include:

Vent placement:
- Intake Vent
- Static Vent
- Ridge Vent

Simulation:
- Start Simulation
- Reset

Reset should:
- stop simulation
- clear particles
- clear all vents
- return the viewer to a clean state

While simulation is running:
- vent placement should be disabled

---

## Development Order

Build V2 in this order:

1. Viewer foundation
2. Connected geometry
3. Input panel
4. Placement zones
5. Vent placement system
6. Accurate vent sizing
7. Calculation engine and results panel
8. Airflow simulation
9. Demo polish

Do not skip ahead if the current step is not stable.

---

## Design Priority

When in doubt, prefer:
- simple
- clean
- modular
- easy to debug
- physically believable for the POC

The POC does not need full CFD.
The POC does need believable airflow behavior, correct vent placement, correct scaling, and clear user feedback.