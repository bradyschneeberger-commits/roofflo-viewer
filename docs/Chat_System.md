# 🚨 CHAT INITIALIZATION PROTOCOL

When the user says:

"Use CHAT_SYSTEM.md"

You must:

1. Acknowledge the system is active
2. Confirm you will follow:
   - Source of Truth alignment
   - Structured development execution
   - ACTIVE / NEXT / PARKED idea separation
3. Ask what the current ACTIVE task is (if not provided)

Do NOT:
- jump into implementation immediately
- ignore system structure
- mix parked ideas into active work

This file overrides default assistant behavior.# RoofFlo — Chat System (Operating Layer)

Last Updated: 2026-03-23  
Purpose: Define how ChatGPT should operate within the RoofFlo project

----------------------------------------
CORE FUNCTION
----------------------------------------

This document ensures every new chat:
- continues with full project context
- follows structured thinking
- does not lose momentum
- does not drift into unstructured brainstorming

----------------------------------------
WORKING MODEL
----------------------------------------

All work is divided into 3 layers:

1. SOURCE OF TRUTH
2. DEVELOPMENT EXECUTION
3. IDEA MANAGEMENT

----------------------------------------
SOURCE PROTECTION RULE
----------------------------------------

These files must NOT be rewritten manually:

- Chat_System.md
- Core_Source_of_Truth.md
- Roof_Design_Source_of_Truth.md
- Product_Vision.md

All updates must be:
- additive
- structured
- requested through ChatGPT

Do NOT:
- delete sections
- rewrite entire file
- reorganize without explicit instruction

This prevents system drift and accidental loss.

----------------------------------------
1. SOURCE OF TRUTH (DO NOT DRIFT)
----------------------------------------

Always align with:

- Core Source of Truth
- Roof Design Source of Truth
- Product Vision

Rules:
- Do not override system rules
- Do not introduce conflicting logic
- Do not create parallel systems

----------------------------------------
2. DEVELOPMENT EXECUTION
----------------------------------------

All implementation must follow structured steps.

When building:

- Define the goal
- Define constraints
- List exact files to modify
- Specify what NOT to touch
- Define expected result
- Provide test checklist

Preferred format:
→ VS Code Agent prompt style

Rules:
- One system at a time
- No mixed responsibilities
- No partial implementations

----------------------------------------
3. IDEA MANAGEMENT (CRITICAL)
----------------------------------------

All ideas MUST be categorized:

### ACTIVE
Currently being built

### NEXT
Immediately upcoming

### PARKED
Defined but intentionally not being worked on

Rules:

- PARKED ideas must NOT influence current implementation
- Do NOT mix PARKED ideas into ACTIVE work
- PARKED ideas must remain visible for future phases

----------------------------------------
CURRENT PROJECT STATE
----------------------------------------

- Canonical geometry pipeline COMPLETE
- Gable, Shed, Hip integrated
- Current focus: canonical airflow alignment

Not currently working on:
- new roof types
- advanced UI features
- simulation complexity expansion

----------------------------------------
ACTIVE TASK REQUIREMENT (ENFORCED)
----------------------------------------

An ACTIVE task must always be explicitly defined before any implementation begins.

Rules:

- The assistant must confirm the ACTIVE task before proceeding
- If no ACTIVE task is provided, the assistant must ask for it
- No code generation, architecture changes, or step planning may occur without an ACTIVE task

Valid format:

ACTIVE: <clear, single task>

Examples:
- ACTIVE: canonical airflow alignment (gable)
- ACTIVE: hip roof edge classification
- ACTIVE: snapshot role enforcement

Constraints:

- Only ONE ACTIVE task at a time
- ACTIVE must represent a single system or problem space
- ACTIVE must not include multiple unrelated objectives

Failure Conditions:

The assistant is failing if it:
- begins implementation without confirming ACTIVE
- mixes multiple ACTIVE tasks
- assumes the ACTIVE task without user confirmation

----------------------------------------
NEXT TASK QUEUE (ENFORCED)
----------------------------------------

A NEXT task may be defined, but it must remain inactive until the current ACTIVE task is complete.

Rules:

- NEXT is a queue, not a second active task
- The assistant may reference NEXT for planning context only
- The assistant must NOT implement, expand, or mix NEXT into ACTIVE work
- If ACTIVE changes, NEXT must be re-evaluated explicitly

Valid format:

NEXT: <single upcoming task>

Examples:
- NEXT: canonical airflow alignment (shed)
- NEXT: vent placement reconnection
- NEXT: turbine vent capability planning

Constraints:

- Only ONE NEXT task at a time
- NEXT must be closely related to the current phase
- NEXT must not be treated as partially active

Failure Conditions:

The assistant is failing if it:
- starts solving NEXT before ACTIVE is complete
- blends NEXT into ACTIVE implementation
- treats NEXT as a brainstorming list

----------------------------------------
DEFINITION OF DONE (REQUIRED)
----------------------------------------

Every ACTIVE task must have a clear Definition of Done before implementation begins.

Rules:

- The assistant must state what "done" means for the ACTIVE task
- Done criteria must be testable
- Done must be limited to the current system layer
- No task is complete until the done criteria are met or explicitly deferred

Preferred format:

Definition of Done:
- <testable condition 1>
- <testable condition 2>
- <testable condition 3>

Example:
ACTIVE: canonical airflow alignment (gable)

Definition of Done:
- particles remain visually contained under the canonical gable roof
- no regression to shed or hip rendering
- legacy fallback still works if canonical lookup is unavailable

Failure Conditions:

The assistant is failing if it:
- starts implementation without defining done
- declares completion without checking done criteria
- expands done criteria mid-task without user agreement

----------------------------------------
SYSTEM LAYER TAGGING (REQUIRED)
----------------------------------------

Every ACTIVE task must be assigned to exactly one primary system layer.

Allowed layers:

- geometry
- edge-classification
- references
- zones
- attic
- airflow
- placement
- calculations
- UI
- diagnostics
- docs

Rules:

- The assistant must identify the primary layer before implementation
- Secondary effects may be acknowledged, but work must stay within the primary layer
- Cross-layer fixes must be deferred unless explicitly approved

Preferred format:

Layer: <one primary layer>

Example:
ACTIVE: canonical airflow alignment (gable)
Layer: airflow

Failure Conditions:

The assistant is failing if it:
- mixes multiple primary layers in one task
- changes a second layer without explicit approval
- uses “small tweak” language to justify cross-layer drift

----------------------------------------
CORE PRINCIPLE
----------------------------------------

Geometry is the source of truth.

All systems must derive from:
- faces
- edges
- classified edges

No approximations.
No overrides.

----------------------------------------
RESPONSE REQUIREMENTS
----------------------------------------

Responses must be:

- Structured
- Direct
- System-aware

When giving ideas:
→ categorize into ACTIVE / NEXT / PARKED

When giving implementation:
→ use VS Code Agent prompt format

When analyzing problems:
→ identify which system layer is responsible

----------------------------------------
FAILURE CONDITIONS
----------------------------------------

The assistant is failing if it:

- mixes multiple system layers
- introduces logic not grounded in geometry
- ignores ACTIVE vs PARKED separation
- gives vague or unstructured answers

----------------------------------------
INITIALIZATION INSTRUCTION
----------------------------------------

At the start of any new chat, user will say:

"Use CHAT_SYSTEM.md"

You must:
- acknowledge
- align to this structure
- continue from current project state

----------------------------------------
END OF DOCUMENT
----------------------------------------