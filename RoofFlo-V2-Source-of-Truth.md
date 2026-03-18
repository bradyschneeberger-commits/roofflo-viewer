# RoofFlo V2 — Source of Truth

## PURPOSE
RoofFlo is an interactive 3D ventilation visualization tool designed to help roofing professionals explain attic airflow and ventilation systems to homeowners.

The system focuses on:
- Education
- Visualization
- Sales support

---

## CORE PRINCIPLES

- 1 unit = 1 foot (Three.js scale)
- Ridge is always centered
- Intake = eaves (lower roof edges)
- Exhaust = ridge or high roof placement
- Simulation is visual + educational (not CFD accurate)
- User is allowed to build incorrect systems (we warn, not block)

---

## CURRENT SYSTEM STATE

### GEOMETRY
- Attic structure dynamically generated
- Roof pitch controls attic height
- Intake plenums exist on both eaves
- Ridge is centered

### VENT TYPES

#### Intake Vents
- Placed along eaves
- Snap to placement line
- Represent air entering system

#### Static Vents (Exhaust)
- Placed on ONE roof slope only
- Cannot exist on both slopes (warning triggered if attempted)
- Represent point exhaust

#### Ridge Vents
- Continuous along ridge
- Includes:
  - center opening strip
  - wider visual coverage strip

---

## VENT PLACEMENT SYSTEM

- Placement modes:
  - Intake
  - Static
  - Ridge

- Snapping:
  - Vents snap to center alignment
  - Prevent sloppy placement

---

## CALCULATIONS

### Inputs
- House width
- House length
- Roof pitch
- Overhang depth
- Ventilation rule (e.g., 1/150)

### Outputs
- Attic area
- Required ventilation (NFVA)
- Required intake
- Required exhaust
- Installed intake
- Installed exhaust
- Intake difference
- Exhaust difference
- Status:
  - Under-ventilated
  - Intake deficient
  - Exhaust deficient
  - Balanced

---

## PRESET SYSTEM

### Available Presets
- Intake Only
- Exhaust Only
- Balanced (needs refinement)

### Rules
- Presets must NEVER create invalid systems
- Balanced preset should:
  - approximate required intake/exhaust
  - allow slight over/under (real-world tolerance)

---

## AIRFLOW SIMULATION

### Default State
- Stale air particles present on load
- Particles move randomly (no escape)

### Behavior Rules

#### BEFORE simulation starts
- Air does NOT interact with vents
- System appears trapped

#### AFTER simulation starts
- Intake introduces fresh air particles
- Fresh air mixes with stale air
- Fresh air gradually becomes stale
- Exhaust allows air to exit

### Particle System Rules
- Maintain baseline stale air count
- Allow particle cap before decay
- Prevent system from “clearing out” unrealistically
- Show inefficiency when only intake or only exhaust is present

---

## VISUAL STATES (MESSAGING SYSTEM)

Message box appears at bottom of screen.

### States:

#### No ventilation
- Color: Transparent Red
- Message: Hot, stale air is trapped

#### Partial system (intake OR exhaust only)
- Color: Transparent Orange
- Message: Airflow is limited / ineffective

#### Airflow present (not balanced)
- Color: Transparent Blue
- Message: Air is moving but not balanced

#### Balanced system
- Color: Transparent Green
- Message: System is functioning properly

---

## WARNING SYSTEM

Warnings DO NOT block user actions.

### Current Warnings
- Static vents placed on both slopes (conflict risk)
- Mixed exhaust types (future expansion)

Purpose:
- Allow real-world bad setups
- Educate user why they are wrong

---

## TOOLBAR (TOP)

### Current Controls
- Save Current (placeholder)
- Restore Current (placeholder)
- Intake Only
- Exhaust Only
- Balanced
- Grid toggle:
  - "Grid" label + button
  - Button switches between:
    - Show
    - Hide

- Start Simulation
- Reset

---

## GRID SYSTEM

- Visible by default
- Toggleable via toolbar
- Uses:
  gridHelper.visible = true/false

- Grid is visual only
- Does NOT affect logic or placement

---

## CONTROL PANEL (LEFT)

Contains:
- House inputs
- Vent placement controls

### Future Improvements
- Reduce width
- Optional slide-in behavior (desktop)

---

## RESULTS PANEL (RIGHT)

Displays:
- Ventilation calculations
- System status

### Future Improvements
- Reduce width
- Optional slide-in behavior

---

## BUILDING FOOTPRINT

- Roof is elevated above grid
- Base extends downward (negative Y)
- Used for visual realism only
- Does NOT interact with:
  - airflow
  - vents
  - calculations

---

## CURRENT PRIORITIES (NEXT STEPS)

### Step 12 — Balanced System Logic (NEXT)
- Intake must scale properly with exhaust
- Allow tolerance range (not exact match)
- Closest real-world balance

### Step 13 — Airflow Refinement (Optional)
- Improve directional clarity
- Fine-tune behavior differences

### Step 14 — Preset Scenarios
- Intake Only
- Exhaust Only
- Poor System (conflict example)
- Balanced

---

## FUTURE UI PHASE

- Slim desktop panels
- Slide-in panels (desktop)
- Toolbar polish
- Optional presentation mode
- Optional light/dark scene modes

---

## PRODUCT DIRECTION

RoofFlo is NOT:
- a full roofing platform

RoofFlo IS:
- a ventilation visualization tool
- a sales education tool
- a system explanation engine

Future goal:
- integrate with platforms like Roofr
- not replace them