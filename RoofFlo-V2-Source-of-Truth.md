# RoofFlo V3 — Source of Truth

## 🎯 Product Vision
RoofFlo is a visual roofing ventilation sales and design tool that allows contractors to:
- simulate attic airflow
- demonstrate ventilation problems
- present a clear solution
- convert that into a proposal

Goal:
Turn complex ventilation concepts into a simple, visual sales experience homeowners instantly understand.

--------------------------------------------------

## 🧱 CORE SYSTEMS

### 1. Geometry System
- Generates attic + intake plenum structure
- Inputs:
  - width
  - length
  - pitch
  - overhang
- Rules:
  - 1 unit = 1 foot
  - ridge always centered

--------------------------------------------------

### 2. Vent Placement System
Supports:
- Intake vents
- Static vents
- Ridge vents

Behavior:
- Placement constrained to valid zones
- Static vents snap to alignment (center line)
- Ridge vents render:
  - center opening strip
  - full vent width overlay

--------------------------------------------------

### 3. Simulation System
- Particle-based airflow visualization

Shows:
- trapped air (no ventilation)
- inefficient flow (imbalanced systems)
- proper airflow (balanced system)

States:
- idle
- running
- reset

--------------------------------------------------

### 4. Snapshot System (CRITICAL)

Snapshots represent complete system states.

Includes:
- geometry
- vent layout
- ventilation calculations
- metadata

#### Snapshot Metadata

{
  role: "current" | "solution" | null,
  solutionType: "balanced" | "upgrade" | null,
  isUserCreated: boolean
}

#### Slide Structure

{
  id,
  label,
  role,
  solutionType,
  isUserCreated,
  snapshot
}

--------------------------------------------------

### 5. Snapshot Roles (CORE)

Roles define presentation meaning:

- current → homeowner’s existing system
- solution → recommended system

Rules:
- Only ONE current snapshot
- Only ONE solution snapshot
- New assignment overrides previous

--------------------------------------------------

### 6. Snapshot UI Workflow

Users can:
- Add Slide (neutral)
- Mark as Current
- Mark as Solution

Visual indicators:
- CURRENT badge
- SOLUTION badge

Goal:
No developer tools required to structure presentation

--------------------------------------------------

## 🎬 PRESENTATION MODE (CORE FEATURE)

### Step Structure

Step 1
No ventilation → trapped heat & moisture

Step 2
Imbalanced system → ineffective

Step 3
Balanced ventilation concept

Step 4 — CURRENT SYSTEM
- Loads snapshot with role: "current"
- Acts as pause / discussion checkpoint
- No automatic transition

Step 5 — SOLUTION

Single step with internal phases:

--------------------------------------------------

### Step 5 Internal Phases

Phase 5A — Intake Upgrade
- reveal / replace intake system

Phase 5B — Exhaust Upgrade
- reveal / replace exhaust system

Phase 5C — Balanced System
- start simulation
- show airflow working

--------------------------------------------------

### Presentation Behavior Rules

- Do NOT animate vents individually
- Animate by system groups (intake / exhaust)
- Keep transitions clean and professional
- Avoid flashy effects

--------------------------------------------------

### Timing

- Optional delay before Phase 5A (~500–700ms)
- Intake phase ~1s
- Exhaust phase ~1s
- Then simulation starts

--------------------------------------------------

### Camera Behavior

- Uses presentation framing system
- Slow orbit allowed
- Stable during transitions

--------------------------------------------------

### Navigation

- Back
- Next
- Exit

Step 5:
- runs automatically (no sub-step clicks)

--------------------------------------------------

### Fallback Rules

If missing:
- current snapshot → fallback to current viewer state
- solution snapshot → fallback to balanced concept

Never:
- crash
- break presentation flow

--------------------------------------------------

## 🧮 CALCULATION SYSTEM

- Calculates required ventilation
- Calculates installed ventilation

Determines:
- balanced
- under-ventilated
- imbalanced

--------------------------------------------------

## 🎯 UX PRINCIPLES

- Contractor-first workflow
- Minimal friction
- Visual clarity over technical detail
- No unnecessary UI layers
- Mobile-first considerations

--------------------------------------------------

## 🚀 CURRENT STATE

- Snapshot system supports roles
- UI supports Current / Solution assignment
- Presentation Mode uses role-based slides
- Step 4 + Step 5 implemented
- Solution phases implemented
- Timing refinement added

System is now a functional sales tool.

--------------------------------------------------

## ⚠️ NEXT PRIORITIES

1. Enforce single current / solution at code level
2. Minor timing polish (Step 5 pacing)
3. Proposal / Report screen
4. Snapshot labeling enhancements

--------------------------------------------------

## 📦 PARKED / FUTURE IDEAS

### Presentation Enhancements
- Replace “Finish” with:
  - “Show Solution”
  - or “View Report”
- Transition directly into proposal screen

### Proposal System
- Show:
  - vent counts
  - system type
  - explanation
  - product recommendations

### Multiple Solutions
- Balanced
- Upgrade
- Budget

### Simulation Improvements
- Start with trapped particles
- Show intake-only vs exhaust-only inefficiency

### UI Improvements
- Unified mobile drawer
- Sliding desktop panels
- Cleaner action bar

### Visual Polish
- Vent colors
- Grid styling
- Panel sizing

### Business Layer
- SaaS pricing
- Accounts
- Save/share projects
- Platform integrations