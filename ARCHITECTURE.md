========================================
ROOFFLO ARCHITECTURE
========================================

Last Updated: 2026-03-26

----------------------------------------
GEOMETRY MODULE
----------------------------------------

Responsible for:

- Constructing canonical roof enclosure geometry:
  - exterior roof faces
  - underside/soffit faces
  - end-cap enclosure faces

Outputs:
- canonical faces
- edges
- geometry state

----------------------------------------
VENTS MODULE
----------------------------------------

Responsible for:

- Intake vent placement on soffit faces  
- Exhaust vent placement on roof faces  

Rules:

- Intake attaches to soffit surfaces  
- Exhaust attaches to roof surfaces  
- All placement derives from canonical references  

----------------------------------------
AIRFLOW MODULE
----------------------------------------

Responsible for:

- Particle simulation inside roof enclosure  

Future:

- Must derive containment from canonical faces  
- No plenum-based partition assumptions  

----------------------------------------
CALCULATIONS MODULE
----------------------------------------

Responsible for:

- Ventilation requirements  
- Installed ventilation totals  
- System evaluation  

----------------------------------------
END OF ARCHITECTURE
----------------------------------------