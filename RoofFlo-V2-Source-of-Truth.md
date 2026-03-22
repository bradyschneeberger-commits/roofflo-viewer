# RoofFlo V3 — Source of Truth

## Product Vision
RoofFlo is a visual roofing ventilation sales and design tool that allows contractors to:
- simulate attic airflow
- demonstrate ventilation problems
- present a clear solution
- generate a report/proposal workflow

Goal:
Turn complex ventilation concepts into a simple, visual sales experience homeowners instantly understand.

--------------------------------------------------
## CORE SYSTEMS

### 1. Geometry System
- Generates roof + attic / airflow structure
- Inputs:
  - roofType
  - width
  - length
  - pitch
  - overhang
- Rules:
  - 1 unit = 1 foot
  - building footprint and overhang must be treated separately
  - roof-type logic must be independent
  - geometry rebuild must fully replace previous roof-type geometry

### 2. Vent Placement System
Supports:
- Intake vents
- Static vents
- Ridge vents

Behavior:
- placement constrained to valid zones
- placement must use roof-type-specific references
- manual placement and preset placement must reuse the same final placement/orientation logic
- no duplicate placement paths that drift apart

### 3. Simulation System
- Particle-based airflow visualization

Shows:
- trapped air
- inefficient flow
- proper airflow

Rules:
- airflow routing must be roof-type aware
- no fallback to gable-style intake/exhaust assumptions
- for Shed, airflow direction is low intake side → high exhaust side

### 4. Snapshot System
Snapshots represent complete system states.

Includes:
- geometry
- vent layout
- ventilation calculations
- metadata

Metadata shape:
{
  role: "current" | "solution" | null,
  solutionType: "balanced" | "upgrade" | null,
  isUserCreated: boolean
}

### 5. Snapshot Roles
- current = homeowner existing system
- solution = recommended system

Rules:
- only one current snapshot
- only one solution snapshot
- new assignment overrides previous

--------------------------------------------------
## CURRENT WORKFLOWS

### Launch / Entry
- RoofFlo Visualizer is the core product entry
- Create RoofFlo Report and Quick Calculator are supporting tools
- entering Visualizer uses roof selection overlay first
- opening Viewer from Quick Calculator uses the same roof-selection flow

### Visualizer Entry
- roof selection overlay appears before geometry loads
- roof selection sets roofType
- setup drawer opens automatically after selection
- selected roofType syncs into Setup panel

### Workspace UI
- top action bar is icon-based
- bottom unified tool drawer includes:
  - Setup
  - Vent Placement
  - Presets
  - Presentation

### Setup Drawer
- Roof Type appears first
- setup drawer includes a System Overview panel
- layout is tuned and stable
- setup values update geometry and system overview correctly

--------------------------------------------------
## PRESENTATION / REPORT STATE

### Presentation Mode
Implemented:
- Step 1–3 education
- Step 4 current system checkpoint
- Step 5 solution with phased reveal

Step 5 phases:
- 5A intake upgrade
- 5B exhaust upgrade
- 5C balanced airflow simulation

### Report
Current report structure is working:
- left = verdict / diagnosis
- right = recommended action
- current vs solution comparison
- recommendation/report transition established

--------------------------------------------------
## CURRENT ROOF STATUS

### Gable
Working:
- geometry
- intake placement
- static placement
- ridge placement
- presets
- airflow

### Shed
Working:
- geometry
- plenum/eave construction
- intake zone
- intake placement
- static placement
- preset placement
- airflow direction / routing
- roof-type-specific exhaust behavior

Important lessons from Shed:
- geometry must be corrected before placement is corrected
- building footprint, roof body, overhang, and plenum must be treated as separate concepts
- manual and preset placement must share the same final placement logic
- one-sided roofs cannot reuse left/right assumptions
- roof-type-specific references must be created before airflow and presets behave correctly

### Hip
Not implemented yet.
Next major roof type.

--------------------------------------------------
## ROOF-TYPE ARCHITECTURE RULES

- RoofFlo is not a gable system with variations
- Each roof type must be treated as its own model
- No roof type may silently fall back to gable logic
- Geometry, edges, intake logic, exhaust logic, and preset behavior must branch by roofType
- Placement and airflow must consume roof-type-specific references

--------------------------------------------------
## PLACEMENT RULES

### Shared
- valid zones must be roof-type aware
- final placement transform must be surface-aware
- mirrored roof surfaces must compute correct outward direction
- manual and preset placement must not diverge

### Intake
- intake placement line should snap to the centerline of the intended intake zone
- not the outside edge unless explicitly designed that way
- for Shed, intake snaps to the center of the true low intake/eave zone

### Exhaust
- static vent placement must sit flush on the roof plane
- static vent placement must project outward, not into the attic
- preset static vent placement must reuse the same placement logic as manual static vent placement

--------------------------------------------------
## PARKED / FUTURE RULES

These are defined and should not be forgotten:

### Exhaust restriction rule
Exhaust vents of any kind must NOT be placed on:
- hips
- valleys

This applies to:
- static vents
- ridge vents
- turbine vents
- power fans
- future exhaust devices

This rule is defined now and should be enforced when edge classification / restricted-edge placement is implemented for complex roofs.

### Future roof-context cases
- shed roof terminating into a wall
- vaulted / cathedral ceilings
- multi-level / bump-out roofs
- complex intersecting roof forms

--------------------------------------------------
## CURRENT PRIORITIES

1. lock in updated source files
2. start Hip roof with geometry + edge classification only
3. then add Hip placement rules
4. then add Hip presets
5. continue report/proposal evolution after roof architecture is stable

--------------------------------------------------
## NEXT RULE FOR NEW ROOF TYPES

When adding a new roof type:
1. define geometry
2. define edge classification
3. define intake/exhaust assumptions
4. define placement references
5. route presets explicitly
6. then connect airflow

Do not patch new roof types into old assumptions.