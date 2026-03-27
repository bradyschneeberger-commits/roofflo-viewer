========================================
ROOF DESIGN — SOURCE OF TRUTH
========================================

Last Updated: 2026-03-26  
Scope: Canonical roof geometry definition

----------------------------------------
UNIVERSAL ROOF MODEL
----------------------------------------

A roof is defined by:

1. Faces (all planar enclosure surfaces)  
2. Edges (boundaries + intersections)

A roof includes:

- Exterior roof faces  
- Underside / soffit faces  
- End-cap enclosure faces  

A roof is NOT defined by:
- zones  
- placement  
- airflow  

----------------------------------------
FACE RULES
----------------------------------------

- Faces must be planar  
- Faces must fully define the roof enclosure  
- All face types must be constructed before edge derivation  
- Faces must connect without gaps  

Face Categories:

1. Exterior Roof Faces  
2. Underside / Soffit Faces  
3. End-Cap Enclosure Faces  

----------------------------------------
EDGE RULES
----------------------------------------

Edges are derived from face boundaries.

Edge types are determined by:
- geometry  
- adjacency relationships  

----------------------------------------
ROOF CONSTRUCTION ORDER
----------------------------------------

1. Construct ALL faces  
2. Derive edges  
3. Classify edges  

----------------------------------------
CLOSED ROOF-SHELL GEOMETRY MODEL
----------------------------------------

Purpose:
Define a complete roof enclosure above the building footprint.

Surface Groups:

1. Exterior Roof Faces  
2. Underside / Soffit Faces  
3. End-Cap Enclosure Faces  

Rules:

- Intake uses soffit faces  
- Exhaust uses roof faces  
- Geometry must be fully enclosed  
- Building footprint defines lower boundary  

----------------------------------------
END OF SOURCE
----------------------------------------