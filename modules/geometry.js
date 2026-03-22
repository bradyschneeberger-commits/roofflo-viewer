/*
RoofFlo V2
File: geometry.js

Purpose:
Generate the connected attic airflow geometry.

Responsibilities:
- Create attic core geometry
- Create left intake zone
- Create right intake zone
- Calculate attic height from roof pitch
- Convert inches to feet for geometry

Rules:
- 1 Three.js unit = 1 foot
- Ridge must always be centered
- Intake zones must connect to attic core
- Roof envelope is based on building width + overhangs
- Attic volume is based on building footprint only

Inputs:
buildingWidth
buildingLength
pitchRise
overhangDepth
plenumHeight

Exports:
createAtticGeometry()
atticSystem
atticCore
leftPlenum
rightPlenum
atticHeight
*/
/*
Dependencies:
- three
- modules/scene.js
*/

import * as THREE from "three";
import { scene } from "./scene.js";
import { validateRoofType } from "../main.js";

// Geometry references
let atticSystem = null;
let buildingFootprintBase = null;
let roofEnvelope = null;
let atticCore = null;
let intakePlenum = null;
let leftPlenum = null;
let rightPlenum = null;
let leftIntakePlacement = null;
let rightIntakePlacement = null;
let leftExhaustZone = null;
let rightExhaustZone = null;
let leftStaticPlacementLine = null;
let rightStaticPlacementLine = null;
let ridgeCenterLine = null;
let intakeEdgeLine = null;
let exhaustEdgeLine = null;
let atticHeight = 0;
let intakeZones = null;
let placementReferences = null;
let edgeClassification = null;

// Optional stored params
let currentGeometryParams = null;

function createGableRoof({ pitchRise, halfBuildingWidth, halfRoofWidth }) {
    const pitchRun = 12;
    const atticPeakHeight = (pitchRise / pitchRun) * halfBuildingWidth;
    const roofHeightAtBuildingEdge = atticPeakHeight * (1 - (halfBuildingWidth / halfRoofWidth));

    return {
        roofType: "gable",
        atticHeight: atticPeakHeight,
        roofEnvelopePoints: [
            new THREE.Vector2(-halfRoofWidth, 0),
            new THREE.Vector2(0, atticPeakHeight),
            new THREE.Vector2(halfRoofWidth, 0)
        ],
        atticPoints: [
            new THREE.Vector2(-halfBuildingWidth, 0),
            new THREE.Vector2(-halfBuildingWidth, roofHeightAtBuildingEdge),
            new THREE.Vector2(0, atticPeakHeight),
            new THREE.Vector2(halfBuildingWidth, roofHeightAtBuildingEdge),
            new THREE.Vector2(halfBuildingWidth, 0)
        ],
        roofHeightAtBuildingEdgeLeft: roofHeightAtBuildingEdge,
        roofHeightAtBuildingEdgeRight: roofHeightAtBuildingEdge,
        roofHeightAtLeftOverhang: 0,
        roofHeightAtRightOverhang: 0,
        ridgeX: 0,
        ridgeY: atticPeakHeight,
        roofSlopeAngle: Math.atan2(pitchRise, pitchRun),
        hasRidge: true,
        staticPlacement: {
            leftDownslope: 1.5,
            rightDownslope: 1.5
        },
        exhaustBands: {
            left: { inner: 0, outer: 3 },
            right: { inner: 0, outer: 3 }
        },
        edgeRoles: {
            intake: {
                type: "dual-eave",
                lowSide: "left-right"
            },
            exhaust: {
                type: "ridge",
                highSide: "center"
            }
        },
        edgeClassification: {
            intakeEdges: ["left-eave", "right-eave"],
            exhaustEdges: ["ridge"],
            ridgeEdges: ["ridge"],
            sideEdges: ["left-rake", "right-rake"]
        },
        edgeReferenceX: {
            intake: -halfBuildingWidth,
            exhaust: 0
        }
    };
}

function createShedRoof({ pitchRise, buildingWidth, overhangDepth, halfBuildingWidth }) {
    const slopePerFoot = pitchRise / 12;
    const lowEaveX = -halfBuildingWidth - overhangDepth;
    const highWallX = halfBuildingWidth;
    const roofHeightAtLeftOverhang = 0;
    const roofHeightAtBuildingEdgeLeft = slopePerFoot * overhangDepth;
    const roofHeightAtBuildingEdgeRight = roofHeightAtBuildingEdgeLeft + (slopePerFoot * buildingWidth);
    const roofHeightAtRightOverhang = null;
    const atticPeakHeight = roofHeightAtBuildingEdgeRight;

    return {
        roofType: "shed",
        atticHeight: atticPeakHeight,
        roofEnvelopePoints: [
            new THREE.Vector2(lowEaveX, roofHeightAtLeftOverhang),
            new THREE.Vector2(-halfBuildingWidth, roofHeightAtBuildingEdgeLeft),
            new THREE.Vector2(highWallX, roofHeightAtBuildingEdgeRight),
            new THREE.Vector2(highWallX, 0)
        ],
        atticPoints: [
            new THREE.Vector2(-halfBuildingWidth, 0),
            new THREE.Vector2(-halfBuildingWidth, roofHeightAtBuildingEdgeLeft),
            new THREE.Vector2(highWallX, roofHeightAtBuildingEdgeRight),
            new THREE.Vector2(highWallX, 0)
        ],
        roofHeightAtBuildingEdgeLeft,
        roofHeightAtBuildingEdgeRight,
        roofHeightAtLeftOverhang,
        roofHeightAtRightOverhang,
        ridgeX: null,
        ridgeY: null,
        exhaustReferenceX: highWallX,
        exhaustReferenceY: roofHeightAtBuildingEdgeRight,
        roofSlopeAngle: Math.atan2(pitchRise, 12),
        hasRidge: false,
        staticPlacement: {
            exhaustDownslope: 1.5
        },
        exhaustBands: {
            high: { inner: 0, outer: 3 }
        },
        intakePlacementX: {
            low: lowEaveX
        },
        edgeRoles: {
            intake: {
                type: "low-eave",
                lowSide: "left"
            },
            exhaust: {
                type: "high-edge",
                highSide: "right"
            }
        },
        edgeClassification: {
            intakeEdges: ["low-eave"],
            exhaustEdges: ["high-edge"],
            ridgeEdges: [],
            sideEdges: ["front-rake", "rear-rake"]
        },
        edgeReferenceX: {
            intake: lowEaveX,
            exhaust: highWallX
        }
    };
}

function createHipRoof({ pitchRise, buildingWidth, buildingLength, overhangDepth, halfBuildingWidth, halfBuildingLength, halfRoofWidth, halfRoofLength }) {
    const slopePerFoot = pitchRise / 12;
    const innerSpanToPeak = Math.min(halfBuildingWidth, halfBuildingLength);
    const outerSpanToPeak = Math.min(halfRoofWidth, halfRoofLength);
    const ridgeAxis = halfBuildingLength >= halfBuildingWidth ? "z" : "x";
    const atticPeakHeight = slopePerFoot * innerSpanToPeak;
    const roofHeightAtBuildingEdge = slopePerFoot * (outerSpanToPeak - innerSpanToPeak);
    const roofEnvelopePeakHeight = slopePerFoot * outerSpanToPeak;
    const buildingRidgeHalfLength = Math.max(0, Math.max(halfBuildingWidth, halfBuildingLength) - innerSpanToPeak);
    const outerRidgeHalfLength = Math.max(0, Math.max(halfRoofWidth, halfRoofLength) - outerSpanToPeak);
    const hasRidge = buildingRidgeHalfLength > 0.0001;

    return {
        roofType: "hip",
        atticHeight: atticPeakHeight,
        buildingWidth,
        buildingLength,
        halfBuildingWidth,
        halfBuildingLength,
        halfRoofWidth,
        halfRoofLength,
        roofHeightAtBuildingEdgeLeft: roofHeightAtBuildingEdge,
        roofHeightAtBuildingEdgeRight: roofHeightAtBuildingEdge,
        roofHeightAtLeftOverhang: 0,
        roofHeightAtRightOverhang: 0,
        ridgeX: hasRidge && ridgeAxis === "z" ? 0 : null,
        ridgeY: hasRidge ? roofEnvelopePeakHeight : null,
        buildingRidgeHalfLength,
        outerRidgeHalfLength,
        roofEnvelopePeakHeight,
        hasRidge,
        ridgeAxis,
        roofSlopeAngle: Math.atan2(pitchRise, 12),
        intakeReferenceInset: overhangDepth / 2,
        edgeRoles: {
            intake: {
                type: "perimeter-eaves",
                lowSide: "perimeter"
            },
            exhaust: {
                type: hasRidge ? "short-ridge" : "apex",
                highSide: hasRidge ? "center-ridge" : "center-apex"
            }
        },
        edgeClassification: {
            intakeEdges: ["front-eave", "right-eave", "rear-eave", "left-eave"],
            exhaustEdges: hasRidge ? ["upper-left-slope", "upper-right-slope", "upper-front-hip", "upper-rear-hip"] : ["upper-hip-slopes"],
            ridgeEdges: hasRidge ? ["ridge"] : [],
            hipEdges: hasRidge
                ? ["front-left-hip", "front-right-hip", "rear-left-hip", "rear-right-hip"]
                : ["apex-front-left-hip", "apex-front-right-hip", "apex-rear-right-hip", "apex-rear-left-hip"],
            valleyEdges: [],
            sideEdges: ["front-eave", "right-eave", "rear-eave", "left-eave"]
        },
        placementReferenceNames: {
            intake: "perimeterIntakeReferences",
            exhaust: hasRidge ? "ridgeCenterLine" : null
        }
    };
}

function createHipSkeleton({ halfWidth, halfLength, peakHeight, eaveY = 0, ridgeAxis = "z" }) {
    const spanToPeak = Math.min(halfWidth, halfLength);
    const ridgeHalfLength = Math.max(0, Math.max(halfWidth, halfLength) - spanToPeak);
    const hasRidge = ridgeHalfLength > 0.0001;

    const eaveCorners = {
        frontLeft: new THREE.Vector3(-halfWidth, eaveY, -halfLength),
        frontRight: new THREE.Vector3(halfWidth, eaveY, -halfLength),
        rearRight: new THREE.Vector3(halfWidth, eaveY, halfLength),
        rearLeft: new THREE.Vector3(-halfWidth, eaveY, halfLength)
    };

    const ridgePoints = hasRidge
        ? (ridgeAxis === "z"
            ? [
                new THREE.Vector3(0, peakHeight, -ridgeHalfLength),
                new THREE.Vector3(0, peakHeight, ridgeHalfLength)
            ]
            : [
                new THREE.Vector3(-ridgeHalfLength, peakHeight, 0),
                new THREE.Vector3(ridgeHalfLength, peakHeight, 0)
            ])
        : [new THREE.Vector3(0, peakHeight, 0)];

    return {
        hasRidge,
        ridgeAxis,
        ridgeHalfLength,
        peakHeight,
        eaveY,
        eaveCorners,
        ridgePoints
    };
}

function createPerimeterEdgeLoopFromCorners(corners) {
    return [
        corners.frontLeft,
        corners.frontRight,
        corners.rearRight,
        corners.rearLeft
    ];
}

function resolveHipRoofVertices({ outerSkeleton, innerSkeleton, roofHeightAtBuildingEdge, ridgeAxis }) {
    // Resolve complete Hip roof vertex system from inner/outer skeletons
    // All downstream geometry derives from these resolved vertices
    // This ensures roof planes share clean intersections and ridge/intake zones
    // are geometrically coherent, not arbitrarily extruded
    
    const oE = outerSkeleton.eaveCorners;
    const iE = innerSkeleton.eaveCorners;
    
    // Compute hip-edge vertices: where roof planes meet at building roof edge height
    // These form the transition between overhang band and attic core
    // Hip edges represent the perimeter where roof slope reaches building roof height
    const hipEdges = {
        frontLeft: new THREE.Vector3(iE.frontLeft.x, roofHeightAtBuildingEdge, iE.frontLeft.z),
        frontRight: new THREE.Vector3(iE.frontRight.x, roofHeightAtBuildingEdge, iE.frontRight.z),
        rearRight: new THREE.Vector3(iE.rearRight.x, roofHeightAtBuildingEdge, iE.rearRight.z),
        rearLeft: new THREE.Vector3(iE.rearLeft.x, roofHeightAtBuildingEdge, iE.rearLeft.z)
    };
    
    // Explicit shared perimeter loops, solved once and reused by all connected layers.
    const outerPerimeterEdgeLoop = createPerimeterEdgeLoopFromCorners(oE);
    const innerPerimeterEdgeLoop = createPerimeterEdgeLoopFromCorners(hipEdges);

    // Ridge/apex points from outer and inner skeletons.
    const outerPeakVertices = outerSkeleton.ridgePoints;
    const innerPeakVertices = innerSkeleton.ridgePoints;
    
    // All vertices used in roof geometry (in order for BufferGeometry)
    // Layer 0: outer eave corners (0-3)
    // Layer 1: hip-edge vertices (4-7, at building roof height)
    // Layer 2: ridge/apex vertices (8-9 or just 8)
    const allVertices = [
        outerPerimeterEdgeLoop[0], // 0
        outerPerimeterEdgeLoop[1], // 1
        outerPerimeterEdgeLoop[2], // 2
        outerPerimeterEdgeLoop[3], // 3
        innerPerimeterEdgeLoop[0], // 4
        innerPerimeterEdgeLoop[1], // 5
        innerPerimeterEdgeLoop[2], // 6
        innerPerimeterEdgeLoop[3], // 7
        outerPeakVertices[0]       // 8 (ridge point 1 or apex)
    ];
    
    if (outerSkeleton.hasRidge && outerPeakVertices.length > 1) {
        allVertices.push(outerPeakVertices[1]); // 9 (ridge point 2)
    }
    
    return {
        hasRidge: outerSkeleton.hasRidge,
        ridgeAxis,
        outerPerimeterEdgeLoop,
        innerPerimeterEdgeLoop,
        outerPeakVertices,
        innerPeakVertices,
        outerEaves: oE,
        innerEaves: iE,
        hipEdges,
        peakVertices: outerPeakVertices,
        allVertices,
        vertexCount: allVertices.length
    };
}

function createHipRoofSurfaceGeometry(resolvedVertices) {
    const { allVertices, hasRidge, ridgeAxis } = resolvedVertices;
    const geometry = new THREE.BufferGeometry().setFromPoints(allVertices);
    
    // Create faces from resolved vertices
    // Vertices layout:
    // 0-3: outer eaves (frontLeft, frontRight, rearRight, rearLeft)
    // 4-7: hip edges (frontLeft, frontRight, rearRight, rearLeft)
    // 8-9: ridge/apex points
    
    const indices = [];
    
    if (hasRidge) {
        // Ridge roof: roof planes meet at a ridge line
        const ridgePt1 = 8;  // ridge point 1
        const ridgePt2 = 9;  // ridge point 2
        
        if (ridgeAxis === "z") {
            // Ridge runs along Z axis
            // Front slope: outer front edge to ridge
            indices.push(0, 1, 4);    // fl, fr, hip-fl
            indices.push(1, 5, 4);    // fr, hip-fr, hip-fl
            indices.push(4, 5, ridgePt1);  // hip-fl, hip-fr, ridge-z-
            
            // Right slope: outer right edge to ridge
            indices.push(1, 2, 5);    // fr, rr, hip-fr
            indices.push(2, 6, 5);    // rr, hip-rr, hip-fr
            indices.push(5, 6, ridgePt2);  // hip-fr, hip-rr, ridge-z+
            
            // Rear slope: outer rear edge to ridge
            indices.push(2, 3, 6);    // rr, rl, hip-rr
            indices.push(3, 7, 6);    // rl, hip-rl, hip-rr
            indices.push(6, 7, ridgePt2);  // hip-rr, hip-rl, ridge-z+
            
            // Left slope: outer left edge to ridge
            indices.push(3, 0, 7);    // rl, fl, hip-rl
            indices.push(0, 4, 7);    // fl, hip-fl, hip-rl
            indices.push(7, 4, ridgePt1);  // hip-rl, hip-fl, ridge-z-
            
            // Ridge cap (visible from above on longer axis)
            indices.push(ridgePt1, ridgePt2, 5);  // ridge-z-, ridge-z+, hip-fr
            indices.push(ridgePt1, 5, 4);        // ridge-z-, hip-fr, hip-fl
            indices.push(ridgePt2, 6, 7);        // ridge-z+, hip-rr, hip-rl
            indices.push(ridgePt2, 7, ridgePt1); // ridge-z+, hip-rl, ridge-z-
        } else {
            // Ridge runs along X axis
            // Front slope (shorter side)
            indices.push(0, 4, 7);    // fl, hip-fl, hip-rl
            indices.push(0, 7, 3);    // fl, hip-rl, rl
            indices.push(4, ridgePt1, 7); // hip-fl, ridge-x-, hip-rl
            
            // Right slope (longer side)
            indices.push(1, 5, 4);    // fr, hip-fr, hip-fl
            indices.push(1, 4, 0);    // fr, hip-fl, fl
            indices.push(5, ridgePt2, ridgePt1); // hip-fr, ridge-x+, ridge-x-
            indices.push(5, ridgePt1, 4);        // hip-fr, ridge-x-, hip-fl
            
            // Rear slope (longer side)
            indices.push(2, 6, 5);    // rr, hip-rr, hip-fr
            indices.push(2, 5, 1);    // rr, hip-fr, fr
            indices.push(6, ridgePt2, ridgePt1); // hip-rr, ridge-x+, ridge-x-
            indices.push(6, ridgePt1, 5);        // hip-rr, ridge-x-, hip-fr
            
            // Left slope (shorter side)
            indices.push(3, 7, 6);    // rl, hip-rl, hip-rr
            indices.push(3, 6, 2);    // rl, hip-rr, rr
            indices.push(7, ridgePt1, 6); // hip-rl, ridge-x-, hip-rr
        }
    } else {
        // Apex roof: all slopes meet at single point
        const apex = 8;
        
        // Front slope
        indices.push(0, 1, 4);
        indices.push(1, 5, 4);
        indices.push(4, 5, apex);
        
        // Right slope
        indices.push(1, 2, 5);
        indices.push(2, 6, 5);
        indices.push(5, 6, apex);
        
        // Rear slope
        indices.push(2, 3, 6);
        indices.push(3, 7, 6);
        indices.push(6, 7, apex);
        
        // Left slope
        indices.push(3, 0, 7);
        indices.push(0, 4, 7);
        indices.push(7, 4, apex);
    }
    
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createHipAtticVolumeGeometry(resolvedVertices) {
    const { innerPerimeterEdgeLoop, innerPeakVertices, hasRidge, ridgeAxis } = resolvedVertices;
    const frontLeft = innerPerimeterEdgeLoop[0];
    const frontRight = innerPerimeterEdgeLoop[1];
    const rearRight = innerPerimeterEdgeLoop[2];
    const rearLeft = innerPerimeterEdgeLoop[3];
    const floorCorners = [
        new THREE.Vector3(frontLeft.x, 0, frontLeft.z),
        new THREE.Vector3(frontRight.x, 0, frontRight.z),
        new THREE.Vector3(rearRight.x, 0, rearRight.z),
        new THREE.Vector3(rearLeft.x, 0, rearLeft.z)
    ];
    const topCorners = [frontLeft, frontRight, rearRight, rearLeft];
    const topVertices = hasRidge ? [innerPeakVertices[0], innerPeakVertices[1]] : [innerPeakVertices[0]];
    const geometry = new THREE.BufferGeometry().setFromPoints([...floorCorners, ...topCorners, ...topVertices]);

    const indices = [
        0, 2, 1,
        0, 3, 2,
        0, 1, 5,
        0, 5, 4,
        1, 2, 6,
        1, 6, 5,
        2, 3, 7,
        2, 7, 6,
        3, 0, 4,
        3, 4, 7
    ];

    if (hasRidge) {
        if (ridgeAxis === "z") {
            indices.push(
                4, 5, 8,
                5, 6, 9,
                5, 9, 8,
                6, 7, 9,
                7, 4, 8,
                7, 8, 9
            );
        } else {
            indices.push(
                4, 7, 8,
                4, 8, 9,
                4, 9, 5,
                5, 9, 6,
                7, 6, 9,
                7, 9, 8
            );
        }
    } else {
        indices.push(
            4, 5, 8,
            5, 6, 8,
            6, 7, 8,
            7, 4, 8
        );
    }

    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createReferenceLine(start, end, name, color) {
    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, end]),
        new THREE.LineBasicMaterial({ color })
    );
    line.name = name;
    return line;
}

function createQuadZoneMesh(points, material, name) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        points[0].x, points[0].y, points[0].z,
        points[1].x, points[1].y, points[1].z,
        points[2].x, points[2].y, points[2].z,
        points[3].x, points[3].y, points[3].z
    ]);

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
}

function createAtticGeometry({
    buildingWidth = 30,
    buildingLength = 50,
    pitchRise,
    overhangDepth = 16 / 12,   // feet
    plenumHeight = 4 / 12,     // feet
    roofType = "gable"
} = {}) {
    // Store current params
    currentGeometryParams = {
        buildingWidth,
        buildingLength,
        pitchRise,
        overhangDepth,
        plenumHeight,
        roofType
    };

    // Remove old geometry group if it exists
    if (atticSystem) {
        scene.remove(atticSystem);
    }

    // Remove old visual-only building footprint base if it exists
    if (buildingFootprintBase) {
        scene.remove(buildingFootprintBase);
        if (buildingFootprintBase.geometry) {
            buildingFootprintBase.geometry.dispose();
        }
        if (buildingFootprintBase.material) {
            if (Array.isArray(buildingFootprintBase.material)) {
                for (const material of buildingFootprintBase.material) {
                    material.dispose();
                }
            } else {
                buildingFootprintBase.material.dispose();
            }
        }
        buildingFootprintBase = null;
    }

    // Create new group
    atticSystem = new THREE.Group();
    atticSystem.name = "atticSystem";
    scene.add(atticSystem);

    // --------------------------------------------------
    // Visual-only footprint/base below attic system
    // --------------------------------------------------
    const baseHeight = 1.75;
    const baseTopY = -0.08;
    const baseSideMaterial = new THREE.MeshStandardMaterial({
        color: 0x9a9a9a,
        transparent: true,
        opacity: 0.85,
        roughness: 0.88,
        metalness: 0
    });
    const baseTopMaterial = new THREE.MeshStandardMaterial({
        color: 0xb0b0b0,
        transparent: true,
        opacity: 0.85,
        roughness: 0.82,
        metalness: 0
    });

    buildingFootprintBase = new THREE.Mesh(
        new THREE.BoxGeometry(buildingWidth, baseHeight, buildingLength),
        [
            baseSideMaterial,
            baseSideMaterial,
            baseTopMaterial,
            baseSideMaterial,
            baseSideMaterial,
            baseSideMaterial
        ]
    );
    buildingFootprintBase.name = "buildingFootprintBase";
    buildingFootprintBase.position.set(0, baseTopY - (baseHeight / 2), 0);
    buildingFootprintBase.castShadow = false;
    buildingFootprintBase.receiveShadow = true;
    buildingFootprintBase.userData.isVisualOnly = true;
    scene.add(buildingFootprintBase);

    // Calculations
    const halfBuildingWidth = buildingWidth / 2;
    const halfBuildingLength = buildingLength / 2;
    const roofWidth = buildingWidth + (2 * overhangDepth);
    const roofLength = buildingLength + (2 * overhangDepth);
    const halfRoofWidth = roofWidth / 2;
    const halfRoofLength = roofLength / 2;

    const normalizedRoofType = validateRoofType(roofType);
    const roofBuilder = normalizedRoofType === "shed"
        ? createShedRoof
        : (normalizedRoofType === "hip" ? createHipRoof : createGableRoof);

    const roofProfile = roofBuilder({
        pitchRise,
        buildingWidth,
        buildingLength,
        overhangDepth,
        roofWidth,
        roofLength,
        halfBuildingWidth,
        halfBuildingLength,
        halfRoofWidth,
        halfRoofLength
    });

    atticHeight = roofProfile.atticHeight;
    const roofHeightAtBuildingEdgeLeft = roofProfile.roofHeightAtBuildingEdgeLeft;
    const roofHeightAtBuildingEdgeRight = roofProfile.roofHeightAtBuildingEdgeRight;
    const roofHeightAtLeftOverhang = roofProfile.roofHeightAtLeftOverhang;
    const roofHeightAtRightOverhang = roofProfile.roofHeightAtRightOverhang;
    const ridgeX = roofProfile.ridgeX;
    const ridgeY = roofProfile.ridgeY;
    const exhaustReferenceX = roofProfile.exhaustReferenceX ?? ridgeX;
    const exhaustReferenceY = roofProfile.exhaustReferenceY ?? ridgeY;
    currentGeometryParams.roofEdgeRoles = roofProfile.edgeRoles || null;
    currentGeometryParams.edgeClassification = roofProfile.edgeClassification || null;
    currentGeometryParams.primaryIntakeReference = roofProfile.placementReferenceNames?.intake
        ?? (roofProfile.roofType === "shed" ? "intakeEdgeLine" : "leftIntakePlacement");
    const explicitExhaustReference = roofProfile.placementReferenceNames
        ? roofProfile.placementReferenceNames.exhaust
        : undefined;
    currentGeometryParams.primaryExhaustReference = explicitExhaustReference !== undefined
        ? explicitExhaustReference
        : (roofProfile.roofType === "shed" ? "exhaustEdgeLine" : "ridgeCenterLine");
    currentGeometryParams.hasRidge = Boolean(roofProfile.hasRidge);

    if (roofProfile.roofType === "hip") {
        // Keep geometry dimensions explicit for Hip separation:
        // - buildingFootprint drives attic core extents
        // - roofFootprint drives outer roof shell extents
        // - atticCoreProfile is clipped to enclosed building roof boundary
        // - roofShellProfile extends to overhang-supported outer eaves
        const buildingFootprint = {
            halfWidth: roofProfile.halfBuildingWidth,
            halfLength: roofProfile.halfBuildingLength
        };
        const roofFootprint = {
            halfWidth: roofProfile.halfRoofWidth,
            halfLength: roofProfile.halfRoofLength
        };
        const atticCoreProfile = {
            eaveY: roofProfile.roofHeightAtBuildingEdgeLeft,
            peakY: roofProfile.atticHeight
        };
        const roofShellProfile = {
            eaveY: 0,
            peakY: roofProfile.roofEnvelopePeakHeight
        };

        // Resolve Hip roof from shared vertex system.
        // All roof planes, intake zones, and references derive from one solved geometry.
        
        const outerHipSkeleton = createHipSkeleton({
            halfWidth: roofFootprint.halfWidth,
            halfLength: roofFootprint.halfLength,
            peakHeight: roofShellProfile.peakY,
            eaveY: roofShellProfile.eaveY,
            ridgeAxis: roofProfile.ridgeAxis
        });

        const innerHipSkeleton = createHipSkeleton({
            halfWidth: buildingFootprint.halfWidth,
            halfLength: buildingFootprint.halfLength,
            peakHeight: atticCoreProfile.peakY,
            // Enclosed attic roof boundary at building footprint (not overhang perimeter).
            eaveY: atticCoreProfile.eaveY,
            ridgeAxis: roofProfile.ridgeAxis
        });

        // Resolve complete Hip roof vertex system before creating any meshes
        // This ensures all roof planes meet cleanly at shared vertices
        // and intake zone is geometrically derived, not arbitrarily extruded
        const resolvedVertices = resolveHipRoofVertices({
            outerSkeleton: outerHipSkeleton,
            innerSkeleton: innerHipSkeleton,
            roofHeightAtBuildingEdge: roofProfile.roofHeightAtBuildingEdgeLeft,
            ridgeAxis: roofProfile.ridgeAxis
        });

        // Roof shell from resolved vertices
        // Uses shared vertices so all planes meet cleanly at hip edges and ridge
        const roofGeometry = createHipRoofSurfaceGeometry(resolvedVertices);
        roofEnvelope = new THREE.Mesh(
            roofGeometry,
            new THREE.MeshStandardMaterial({
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        roofEnvelope.name = "roofEnvelope";
        atticSystem.add(roofEnvelope);

        // Attic core from resolved inner perimeter loop and enclosed ridge/apex.
        const atticGeometry = createHipAtticVolumeGeometry(resolvedVertices);
        const atticMaterial = new THREE.MeshStandardMaterial({
            color: 0x00aa00,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        atticCore = new THREE.Mesh(atticGeometry, atticMaterial);
        atticCore.name = "atticCore";
        atticSystem.add(atticCore);

        const atticEdges = new THREE.EdgesGeometry(atticGeometry);
        const atticEdgeLines = new THREE.LineSegments(
            atticEdges,
            new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        atticCore.add(atticEdgeLines);

        intakePlenum = null;
        leftPlenum = null;
        rightPlenum = null;
        leftIntakePlacement = null;
        rightIntakePlacement = null;
        leftExhaustZone = null;
        rightExhaustZone = null;
        leftStaticPlacementLine = null;
        rightStaticPlacementLine = null;
        intakeEdgeLine = null;
        exhaustEdgeLine = null;

        // Intake zone material (standard system)
        const intakeZoneMaterial = new THREE.MeshBasicMaterial({
            color: 0x2255ff,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Intake zones derive from explicit shared perimeter loops.
        // This makes attic-core/intake and intake/roof boundaries exact shared edges.
        const outerPerimeterEdgeLoop = resolvedVertices.outerPerimeterEdgeLoop;
        const innerPerimeterEdgeLoop = resolvedVertices.innerPerimeterEdgeLoop;

        // Create intake zone meshes from resolved vertices
        // Each zone is a sloped quad using outer eaves (Y=0) and hip edges (Y=roofHeightAtBuildingEdge)
        const perimeterIntakeZones = [
            createQuadZoneMesh([
                outerPerimeterEdgeLoop[0],
                outerPerimeterEdgeLoop[1],
                innerPerimeterEdgeLoop[1],
                innerPerimeterEdgeLoop[0]
            ], intakeZoneMaterial.clone(), "frontIntakeZone"),
            createQuadZoneMesh([
                outerPerimeterEdgeLoop[1],
                outerPerimeterEdgeLoop[2],
                innerPerimeterEdgeLoop[2],
                innerPerimeterEdgeLoop[1]
            ], intakeZoneMaterial.clone(), "rightIntakeZone"),
            createQuadZoneMesh([
                outerPerimeterEdgeLoop[2],
                outerPerimeterEdgeLoop[3],
                innerPerimeterEdgeLoop[3],
                innerPerimeterEdgeLoop[2]
            ], intakeZoneMaterial.clone(), "rearIntakeZone"),
            createQuadZoneMesh([
                outerPerimeterEdgeLoop[3],
                outerPerimeterEdgeLoop[0],
                innerPerimeterEdgeLoop[0],
                innerPerimeterEdgeLoop[3]
            ], intakeZoneMaterial.clone(), "leftIntakeZone")
        ];

        for (const intakeZoneMesh of perimeterIntakeZones) {
            atticSystem.add(intakeZoneMesh);
            const zoneEdges = new THREE.EdgesGeometry(intakeZoneMesh.geometry);
            const zoneEdgeLines = new THREE.LineSegments(
                zoneEdges,
                new THREE.LineBasicMaterial({ color: 0xffffff })
            );
            intakeZoneMesh.add(zoneEdgeLines);
        }

        // Perimeter intake reference lines derived from resolved geometry
        // Located at centerline of intake zone band (0.5 lerp between outer and hip edges)
        const perimeterIntakeReferences = [
            createReferenceLine(
                outerPerimeterEdgeLoop[0].clone().lerp(innerPerimeterEdgeLoop[0], 0.5),
                outerPerimeterEdgeLoop[1].clone().lerp(innerPerimeterEdgeLoop[1], 0.5),
                "frontIntakeReference",
                0xffffff
            ),
            createReferenceLine(
                outerPerimeterEdgeLoop[1].clone().lerp(innerPerimeterEdgeLoop[1], 0.5),
                outerPerimeterEdgeLoop[2].clone().lerp(innerPerimeterEdgeLoop[2], 0.5),
                "rightIntakeReference",
                0xffffff
            ),
            createReferenceLine(
                outerPerimeterEdgeLoop[2].clone().lerp(innerPerimeterEdgeLoop[2], 0.5),
                outerPerimeterEdgeLoop[3].clone().lerp(innerPerimeterEdgeLoop[3], 0.5),
                "rearIntakeReference",
                0xffffff
            ),
            createReferenceLine(
                outerPerimeterEdgeLoop[3].clone().lerp(innerPerimeterEdgeLoop[3], 0.5),
                outerPerimeterEdgeLoop[0].clone().lerp(innerPerimeterEdgeLoop[0], 0.5),
                "leftIntakeReference",
                0xffffff
            )
        ];

        for (const intakeReference of perimeterIntakeReferences) {
            atticSystem.add(intakeReference);
        }

        // Ridge reference derived directly from resolved roof vertices
        // Ridge sits exactly on the roof peak (no floating or undefined offsets)
        if (roofProfile.hasRidge) {
            const peakPt1 = resolvedVertices.peakVertices[0];
            const peakPt2 = resolvedVertices.peakVertices[1];
            ridgeCenterLine = createReferenceLine(
                peakPt1.clone(),
                peakPt2.clone(),
                "ridgeCenterLine",
                0xffe347
            );
            atticSystem.add(ridgeCenterLine);
        } else {
            ridgeCenterLine = null;
        }

        // Center Hip assembly for consistent world positioning
        const hipBounds = new THREE.Box3().setFromObject(atticSystem);
        const hipCenter = hipBounds.getCenter(new THREE.Vector3());
        if (Number.isFinite(hipCenter.x) && Number.isFinite(hipCenter.z)) {
            atticSystem.position.x -= hipCenter.x;
            atticSystem.position.z -= hipCenter.z;
        }

        intakeZones = {
            primary: null,
            perimeter: perimeterIntakeZones,
            references: perimeterIntakeReferences,
            legacy: []
        };

        placementReferences = {
            intake: {
                targets: perimeterIntakeReferences.map((reference) => ({
                    key: reference.name,
                    line: reference
                })),
                perimeter: perimeterIntakeReferences,
                legacy: []
            },
            exhaust: {
                primary: ridgeCenterLine,
                ridge: ridgeCenterLine,
                targets: [],
                zones: [],
                legacy: []
            },
            ridge: ridgeCenterLine
        };

        edgeClassification = {
            roofType: roofProfile.roofType,
            intakeEdges: roofProfile.edgeClassification?.intakeEdges || [],
            exhaustEdges: roofProfile.edgeClassification?.exhaustEdges || [],
            ridgeEdges: roofProfile.edgeClassification?.ridgeEdges || [],
            hipEdges: roofProfile.edgeClassification?.hipEdges || [],
            valleyEdges: roofProfile.edgeClassification?.valleyEdges || [],
            sideEdges: roofProfile.edgeClassification?.sideEdges || []
        };

        return {
            roofType: roofProfile.roofType,
            atticSystem,
            buildingFootprintBase,
            roofEnvelope,
            atticCore,
            intakePlenum,
            leftPlenum,
            rightPlenum,
            leftIntakePlacement,
            rightIntakePlacement,
            leftExhaustZone,
            rightExhaustZone,
            leftStaticPlacementLine,
            rightStaticPlacementLine,
            ridgeCenterLine,
            intakeEdgeLine,
            exhaustEdgeLine,
            intakeZones,
            placementReferences,
            edgeClassification,
            atticHeight,
            roofHeightAtBuildingEdge,
            roofWidth
        };
    }

    // Keep compatibility with existing return shape
    const roofHeightAtBuildingEdge = Math.max(roofHeightAtBuildingEdgeLeft, roofHeightAtBuildingEdgeRight);

    const extrudeSettings = {
        depth: buildingLength,
        bevelEnabled: false
    };

    // --------------------------------------------------
    // 1. Roof envelope (hidden construction reference)
    // --------------------------------------------------
    const roofShape = new THREE.Shape();
    const roofEnvelopePoints = roofProfile.roofEnvelopePoints;
    roofShape.moveTo(roofEnvelopePoints[0].x, roofEnvelopePoints[0].y);
    for (let i = 1; i < roofEnvelopePoints.length; i += 1) {
        roofShape.lineTo(roofEnvelopePoints[i].x, roofEnvelopePoints[i].y);
    }
    roofShape.closePath();

    const roofGeometry = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    roofGeometry.translate(0, 0, -buildingLength / 2);

    roofEnvelope = new THREE.Mesh(
        roofGeometry,
        new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    roofEnvelope.name = "roofEnvelope";
    atticSystem.add(roofEnvelope);

    // --------------------------------------------------
    // 2. Main attic air volume (building footprint only)
    // --------------------------------------------------
    const atticShape = new THREE.Shape();
    const atticPoints = roofProfile.atticPoints;
    atticShape.moveTo(atticPoints[0].x, atticPoints[0].y);
    for (let i = 1; i < atticPoints.length; i += 1) {
        atticShape.lineTo(atticPoints[i].x, atticPoints[i].y);
    }
    atticShape.closePath();

    const atticGeometry = new THREE.ExtrudeGeometry(atticShape, extrudeSettings);
    atticGeometry.translate(0, 0, -buildingLength / 2);

    const atticMaterial = new THREE.MeshStandardMaterial({
        color: 0x00aa00,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    atticCore = new THREE.Mesh(atticGeometry, atticMaterial);
    atticCore.name = "atticCore";
    atticSystem.add(atticCore);

    const atticEdges = new THREE.EdgesGeometry(atticGeometry);
    const atticEdgeLines = new THREE.LineSegments(
        atticEdges,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    atticCore.add(atticEdgeLines);

    // --------------------------------------------------
    // 3. Intake zones in overhang regions under roof
    // NOTE:
    // This version keeps the FULL wedge shape for now.
    // We can refine later to a true 4-inch plenum channel.
    // --------------------------------------------------
    const leftPlenumShape = new THREE.Shape();
    const rightPlenumShape = new THREE.Shape();

    if (roofProfile.roofType === "shed") {
        const lowSideChannelHeight = Math.max(plenumHeight, 0.28);
        const highSideChannelHeight = Math.max(plenumHeight, 0.32);
        const lowEaveX = -(halfBuildingWidth + overhangDepth);
        const lowOuterTopY = roofHeightAtLeftOverhang;
        const lowInnerTopY = roofHeightAtBuildingEdgeLeft;
        const lowOuterBottomY = Math.max(0, lowOuterTopY - lowSideChannelHeight);
        const lowInnerBottomY = Math.max(0, lowInnerTopY - lowSideChannelHeight);
        const highWallChannelInset = Math.max(Math.min(overhangDepth * 0.2, 0.35), 0.16);
        const highWallInnerX = halfBuildingWidth - highWallChannelInset;
        const highWallInnerY = roofHeightAtBuildingEdgeRight - (Math.tan(roofProfile.roofSlopeAngle) * highWallChannelInset);

        // Build Shed low-side intake as a wedge under the overhang segment,
        // anchored to the low building edge rather than treated as body span.
        leftPlenumShape.moveTo(lowEaveX, lowOuterBottomY);
        leftPlenumShape.lineTo(-halfBuildingWidth, lowInnerBottomY);
        leftPlenumShape.lineTo(-halfBuildingWidth, lowInnerTopY);
        leftPlenumShape.lineTo(lowEaveX, lowOuterTopY);
        leftPlenumShape.closePath();

        rightPlenumShape.moveTo(highWallInnerX, highWallInnerY - highSideChannelHeight);
        rightPlenumShape.lineTo(halfBuildingWidth, roofHeightAtBuildingEdgeRight - highSideChannelHeight);
        rightPlenumShape.lineTo(halfBuildingWidth, roofHeightAtBuildingEdgeRight);
        rightPlenumShape.lineTo(highWallInnerX, highWallInnerY);
        rightPlenumShape.closePath();
    } else {
        leftPlenumShape.moveTo(-halfRoofWidth, 0);
        leftPlenumShape.lineTo(-halfBuildingWidth, 0);
        leftPlenumShape.lineTo(-halfBuildingWidth, roofHeightAtBuildingEdgeLeft);
        if (roofHeightAtLeftOverhang > 0) {
            leftPlenumShape.lineTo(-halfRoofWidth, roofHeightAtLeftOverhang);
        }
        leftPlenumShape.closePath();

        rightPlenumShape.moveTo(halfBuildingWidth, 0);
        rightPlenumShape.lineTo(halfRoofWidth, 0);
        if (roofHeightAtRightOverhang > 0) {
            rightPlenumShape.lineTo(halfRoofWidth, roofHeightAtRightOverhang);
        }
        rightPlenumShape.lineTo(halfBuildingWidth, roofHeightAtBuildingEdgeRight);
        rightPlenumShape.closePath();
    }

    const leftPlenumGeometry = new THREE.ExtrudeGeometry(leftPlenumShape, extrudeSettings);
    leftPlenumGeometry.translate(0, 0, -buildingLength / 2);

    const plenumMaterial = new THREE.MeshStandardMaterial({
        color: 0x2255ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    intakePlenum = new THREE.Mesh(leftPlenumGeometry, plenumMaterial);
    intakePlenum.name = roofProfile.roofType === "shed" ? "intakePlenum" : "leftPlenum";
    atticSystem.add(intakePlenum);

    const leftPlenumEdges = new THREE.EdgesGeometry(leftPlenumGeometry);
    const leftPlenumEdgeLines = new THREE.LineSegments(
        leftPlenumEdges,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    intakePlenum.add(leftPlenumEdgeLines);

    if (roofProfile.roofType === "shed") {
        leftPlenum = null;
        rightPlenum = null;
    } else {
        leftPlenum = intakePlenum;
        const rightPlenumGeometry = new THREE.ExtrudeGeometry(rightPlenumShape, extrudeSettings);
        rightPlenumGeometry.translate(0, 0, -buildingLength / 2);

        rightPlenum = new THREE.Mesh(rightPlenumGeometry, plenumMaterial);
        rightPlenum.name = "rightPlenum";
        atticSystem.add(rightPlenum);

        const rightPlenumEdges = new THREE.EdgesGeometry(rightPlenumGeometry);
        const rightPlenumEdgeLines = new THREE.LineSegments(
            rightPlenumEdges,
            new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        rightPlenum.add(rightPlenumEdgeLines);
    }

    // --------------------------------------------------
    // 4. Intake placement references (underside centerlines)
    // --------------------------------------------------
    let intakeY = 0.02;
    let intakeEdgeReferenceX = roofProfile.edgeReferenceX?.intake
        ?? (roofProfile.intakePlacementX?.low ?? roofProfile.intakePlacementX?.left ?? -(halfBuildingWidth + (overhangDepth / 2)));

    if (roofProfile.roofType === "shed") {
        const shedPlenumProfile = leftPlenumShape.getPoints();
        if (shedPlenumProfile.length) {
            // Anchor Shed intake reference to the centerline of the low-side intake zone.
            const minX = shedPlenumProfile.reduce(
                (currentMin, point) => Math.min(currentMin, point.x),
                Number.POSITIVE_INFINITY
            );
            const maxX = shedPlenumProfile.reduce(
                (currentMax, point) => Math.max(currentMax, point.x),
                Number.NEGATIVE_INFINITY
            );
            intakeEdgeReferenceX = (minX + maxX) / 2;

            const leftEdgePoints = shedPlenumProfile.filter((point) => Math.abs(point.x - minX) < 0.0001);
            const rightEdgePoints = shedPlenumProfile.filter((point) => Math.abs(point.x - maxX) < 0.0001);

            if (leftEdgePoints.length && rightEdgePoints.length) {
                const leftTopY = leftEdgePoints.reduce((maxY, point) => Math.max(maxY, point.y), Number.NEGATIVE_INFINITY);
                const rightTopY = rightEdgePoints.reduce((maxY, point) => Math.max(maxY, point.y), Number.NEGATIVE_INFINITY);
                const leftBottomY = leftEdgePoints.reduce((minY, point) => Math.min(minY, point.y), Number.POSITIVE_INFINITY);
                const rightBottomY = rightEdgePoints.reduce((minY, point) => Math.min(minY, point.y), Number.POSITIVE_INFINITY);

                const spanX = Math.max(0.0001, maxX - minX);
                const t = (intakeEdgeReferenceX - minX) / spanX;
                const topYAtCenter = leftTopY + ((rightTopY - leftTopY) * t);
                const bottomYAtCenter = leftBottomY + ((rightBottomY - leftBottomY) * t);

                intakeY = ((topYAtCenter + bottomYAtCenter) / 2) + 0.02;
            }
        }
    }
    const intakeEdgePoints = [
        new THREE.Vector3(intakeEdgeReferenceX, intakeY, -buildingLength / 2),
        new THREE.Vector3(intakeEdgeReferenceX, intakeY, buildingLength / 2)
    ];

    intakeEdgeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(intakeEdgePoints),
        new THREE.LineBasicMaterial({ color: 0x66f7ff })
    );
    intakeEdgeLine.name = "intakeEdgeLine";
    atticSystem.add(intakeEdgeLine);

    if (roofProfile.roofType === "shed") {
        leftIntakePlacement = null;
        rightIntakePlacement = null;
    } else {
        const leftIntakeX = roofProfile.intakePlacementX?.left ?? -(halfBuildingWidth + (overhangDepth / 2));
        const rightIntakeX = roofProfile.intakePlacementX?.right ?? (halfBuildingWidth + (overhangDepth / 2));

        const leftIntakePoints = [
            new THREE.Vector3(leftIntakeX, intakeY, -buildingLength / 2),
            new THREE.Vector3(leftIntakeX, intakeY, buildingLength / 2)
        ];
        const rightIntakePoints = [
            new THREE.Vector3(rightIntakeX, intakeY, -buildingLength / 2),
            new THREE.Vector3(rightIntakeX, intakeY, buildingLength / 2)
        ];

        leftIntakePlacement = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(leftIntakePoints),
            new THREE.LineBasicMaterial({ color: 0x66f7ff })
        );
        leftIntakePlacement.name = "leftIntakePlacement";
        atticSystem.add(leftIntakePlacement);

        rightIntakePlacement = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(rightIntakePoints),
            new THREE.LineBasicMaterial({ color: 0x66f7ff })
        );
        rightIntakePlacement.name = "rightIntakePlacement";
        atticSystem.add(rightIntakePlacement);
    }

    // --------------------------------------------------
    // 5. Static exhaust placement zones (3 ft downslope)
    // --------------------------------------------------
    const exhaustDownslopeDepth = 3;
    const roofSlopeAngle = roofProfile.roofSlopeAngle;
    const downslopeDx = Math.cos(roofSlopeAngle) * exhaustDownslopeDepth;
    const downslopeDy = Math.sin(roofSlopeAngle) * exhaustDownslopeDepth;

    function createGableExhaustZoneGeometry(directionX) {
        const ridgeNear = new THREE.Vector3(ridgeX, ridgeY, -buildingLength / 2);
        const ridgeFar = new THREE.Vector3(ridgeX, ridgeY, buildingLength / 2);

        const outerNear = new THREE.Vector3(
            ridgeX + (directionX * downslopeDx),
            ridgeY - downslopeDy,
            -buildingLength / 2
        );
        const outerFar = new THREE.Vector3(
            ridgeX + (directionX * downslopeDx),
            ridgeY - downslopeDy,
            buildingLength / 2
        );

        const zoneGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            ridgeNear.x, ridgeNear.y, ridgeNear.z,
            ridgeFar.x, ridgeFar.y, ridgeFar.z,
            outerFar.x, outerFar.y, outerFar.z,
            outerNear.x, outerNear.y, outerNear.z
        ]);

        zoneGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        zoneGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        zoneGeometry.computeVertexNormals();

        return zoneGeometry;
    }

    function createShedExhaustZoneGeometry(innerDepth, outerDepth) {
        const innerDx = Math.cos(roofSlopeAngle) * innerDepth;
        const innerDy = Math.sin(roofSlopeAngle) * innerDepth;
        const outerDx = Math.cos(roofSlopeAngle) * outerDepth;
        const outerDy = Math.sin(roofSlopeAngle) * outerDepth;

        const innerNear = new THREE.Vector3(
            exhaustReferenceX - innerDx,
            exhaustReferenceY - innerDy,
            -buildingLength / 2
        );
        const innerFar = new THREE.Vector3(
            exhaustReferenceX - innerDx,
            exhaustReferenceY - innerDy,
            buildingLength / 2
        );

        const outerNear = new THREE.Vector3(
            exhaustReferenceX - outerDx,
            exhaustReferenceY - outerDy,
            -buildingLength / 2
        );
        const outerFar = new THREE.Vector3(
            exhaustReferenceX - outerDx,
            exhaustReferenceY - outerDy,
            buildingLength / 2
        );

        const zoneGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            innerNear.x, innerNear.y, innerNear.z,
            innerFar.x, innerFar.y, innerFar.z,
            outerFar.x, outerFar.y, outerFar.z,
            outerNear.x, outerNear.y, outerNear.z
        ]);

        zoneGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        zoneGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        zoneGeometry.computeVertexNormals();

        return zoneGeometry;
    }

    const exhaustZoneMaterial = new THREE.MeshBasicMaterial({
        color: 0xff5a36,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    if (roofProfile.roofType === "shed") {
        const highExhaustGeometry = createShedExhaustZoneGeometry(
            roofProfile.exhaustBands.high.inner,
            roofProfile.exhaustBands.high.outer
        );

        leftExhaustZone = new THREE.Mesh(highExhaustGeometry, exhaustZoneMaterial.clone());
        leftExhaustZone.name = "leftExhaustZone";
        atticSystem.add(leftExhaustZone);

        rightExhaustZone = leftExhaustZone;
    } else {
        const leftExhaustGeometry = createGableExhaustZoneGeometry(-1);
        const rightExhaustGeometry = createGableExhaustZoneGeometry(1);

        leftExhaustZone = new THREE.Mesh(leftExhaustGeometry, exhaustZoneMaterial.clone());
        leftExhaustZone.name = "leftExhaustZone";
        atticSystem.add(leftExhaustZone);

        rightExhaustZone = new THREE.Mesh(rightExhaustGeometry, exhaustZoneMaterial.clone());
        rightExhaustZone.name = "rightExhaustZone";
        atticSystem.add(rightExhaustZone);
    }

    // --------------------------------------------------
    // 5.5 Static vent placement lines (centered in 3-foot zones)
    // --------------------------------------------------
    // Placement lines are centered downslope from ridge/high-side reference
    if (roofProfile.roofType === "shed") {
        const exhaustStaticDx = Math.cos(roofSlopeAngle) * roofProfile.staticPlacement.exhaustDownslope;
        const exhaustStaticDy = Math.sin(roofSlopeAngle) * roofProfile.staticPlacement.exhaustDownslope;
        const exhaustStaticX = exhaustReferenceX - exhaustStaticDx;
        const exhaustStaticY = exhaustReferenceY - exhaustStaticDy;

        const exhaustStaticPlacementPoints = [
            new THREE.Vector3(exhaustStaticX, exhaustStaticY, -buildingLength / 2),
            new THREE.Vector3(exhaustStaticX, exhaustStaticY, buildingLength / 2)
        ];

        leftStaticPlacementLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(exhaustStaticPlacementPoints),
            new THREE.LineBasicMaterial({ color: 0xff8c42, linewidth: 2 })
        );
        leftStaticPlacementLine.name = "leftStaticPlacementLine";
        atticSystem.add(leftStaticPlacementLine);

        rightStaticPlacementLine = leftStaticPlacementLine;
    } else {
        const leftStaticDx = Math.cos(roofSlopeAngle) * roofProfile.staticPlacement.leftDownslope;
        const leftStaticDy = Math.sin(roofSlopeAngle) * roofProfile.staticPlacement.leftDownslope;
        const rightStaticDx = Math.cos(roofSlopeAngle) * roofProfile.staticPlacement.rightDownslope;
        const rightStaticDy = Math.sin(roofSlopeAngle) * roofProfile.staticPlacement.rightDownslope;

        const leftStaticX = ridgeX - leftStaticDx;
        const rightStaticX = ridgeX + rightStaticDx;
        const leftStaticY = ridgeY - leftStaticDy;
        const rightStaticY = ridgeY - rightStaticDy;

        const leftStaticPlacementPoints = [
            new THREE.Vector3(leftStaticX, leftStaticY, -buildingLength / 2),
            new THREE.Vector3(leftStaticX, leftStaticY, buildingLength / 2)
        ];
        const rightStaticPlacementPoints = [
            new THREE.Vector3(rightStaticX, rightStaticY, -buildingLength / 2),
            new THREE.Vector3(rightStaticX, rightStaticY, buildingLength / 2)
        ];

        leftStaticPlacementLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(leftStaticPlacementPoints),
            new THREE.LineBasicMaterial({ color: 0xff8c42, linewidth: 2 })
        );
        leftStaticPlacementLine.name = "leftStaticPlacementLine";
        atticSystem.add(leftStaticPlacementLine);

        rightStaticPlacementLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(rightStaticPlacementPoints),
            new THREE.LineBasicMaterial({ color: 0xff8c42, linewidth: 2 })
        );
        rightStaticPlacementLine.name = "rightStaticPlacementLine";
        atticSystem.add(rightStaticPlacementLine);
    }

    // --------------------------------------------------
    // 6. Ridge centerline reference
    // --------------------------------------------------
    if (roofProfile.hasRidge) {
        const ridgePoints = [
            new THREE.Vector3(ridgeX, ridgeY + 0.01, -buildingLength / 2),
            new THREE.Vector3(ridgeX, ridgeY + 0.01, buildingLength / 2)
        ];
        ridgeCenterLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(ridgePoints),
            new THREE.LineBasicMaterial({ color: 0xffe347 })
        );
        ridgeCenterLine.name = "ridgeCenterLine";
        atticSystem.add(ridgeCenterLine);
    } else {
        ridgeCenterLine = null;
    }

    const exhaustEdgeReferenceX = roofProfile.edgeReferenceX?.exhaust ?? ridgeX;
    const exhaustEdgeReferenceY = roofProfile.hasRidge ? (ridgeY + 0.01) : ((exhaustReferenceY ?? roofHeightAtBuildingEdgeRight) + 0.01);
    const exhaustEdgePoints = [
        new THREE.Vector3(exhaustEdgeReferenceX, exhaustEdgeReferenceY, -buildingLength / 2),
        new THREE.Vector3(exhaustEdgeReferenceX, exhaustEdgeReferenceY, buildingLength / 2)
    ];
    exhaustEdgeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(exhaustEdgePoints),
        new THREE.LineBasicMaterial({ color: 0xffe347 })
    );
    exhaustEdgeLine.name = "exhaustEdgeLine";
    atticSystem.add(exhaustEdgeLine);

    intakeZones = {
        primary: roofProfile.roofType === "shed" ? intakePlenum : null,
        legacy: roofProfile.roofType === "shed" ? [intakePlenum] : [leftPlenum, rightPlenum]
    };

    placementReferences = {
        intake: roofProfile.roofType === "shed"
            ? {
                primary: intakeEdgeLine,
                targets: intakeEdgeLine ? [{ key: "low", line: intakeEdgeLine }] : []
            }
            : {
                primary: leftIntakePlacement,
                secondary: rightIntakePlacement,
                targets: [
                    leftIntakePlacement ? { key: "left", line: leftIntakePlacement } : null,
                    rightIntakePlacement ? { key: "right", line: rightIntakePlacement } : null
                ].filter(Boolean),
                legacy: [leftIntakePlacement, rightIntakePlacement]
            },
        exhaust: roofProfile.roofType === "shed"
            ? {
                primary: exhaustEdgeLine,
                zone: leftExhaustZone,
                targets: [
                    leftStaticPlacementLine && leftExhaustZone
                        ? { key: "high", line: leftStaticPlacementLine, zone: leftExhaustZone }
                        : null,
                    rightStaticPlacementLine && rightExhaustZone
                        ? { key: "high", line: rightStaticPlacementLine, zone: rightExhaustZone }
                        : null
                ].filter(Boolean),
                zones: [leftExhaustZone, rightExhaustZone].filter(Boolean),
                legacy: [leftStaticPlacementLine]
            }
            : {
                primary: leftStaticPlacementLine,
                secondary: rightStaticPlacementLine,
                ridge: ridgeCenterLine,
                targets: [
                    leftStaticPlacementLine && leftExhaustZone
                        ? { key: "left", line: leftStaticPlacementLine, zone: leftExhaustZone }
                        : null,
                    rightStaticPlacementLine && rightExhaustZone
                        ? { key: "right", line: rightStaticPlacementLine, zone: rightExhaustZone }
                        : null
                ].filter(Boolean),
                zones: [leftExhaustZone, rightExhaustZone].filter(Boolean),
                legacy: [leftStaticPlacementLine, rightStaticPlacementLine]
            },
        ridge: roofProfile.hasRidge ? ridgeCenterLine : null
    };

    edgeClassification = {
        roofType: roofProfile.roofType,
        intakeEdges: roofProfile.edgeClassification?.intakeEdges || [],
        exhaustEdges: roofProfile.edgeClassification?.exhaustEdges || [],
        ridgeEdges: roofProfile.edgeClassification?.ridgeEdges || [],
        hipEdges: roofProfile.edgeClassification?.hipEdges || [],
        valleyEdges: roofProfile.edgeClassification?.valleyEdges || [],
        sideEdges: roofProfile.edgeClassification?.sideEdges || []
    };

    return {
        roofType: roofProfile.roofType,
        atticSystem,
        buildingFootprintBase,
        roofEnvelope,
        atticCore,
        intakePlenum,
        leftPlenum,
        rightPlenum,
        leftIntakePlacement,
        rightIntakePlacement,
        leftExhaustZone,
        rightExhaustZone,
        leftStaticPlacementLine,
        rightStaticPlacementLine,
        ridgeCenterLine,
        intakeEdgeLine,
        exhaustEdgeLine,
        intakeZones,
        placementReferences,
        edgeClassification,
        atticHeight,
        roofHeightAtBuildingEdge,
        roofWidth
    };
}

function getGeometryState() {
    return {
        atticSystem,
        buildingFootprintBase,
        roofEnvelope,
        atticCore,
        intakePlenum,
        leftPlenum,
        rightPlenum,
        leftIntakePlacement,
        rightIntakePlacement,
        leftExhaustZone,
        rightExhaustZone,
        leftStaticPlacementLine,
        rightStaticPlacementLine,
        ridgeCenterLine,
        intakeEdgeLine,
        exhaustEdgeLine,
        intakeZones,
        placementReferences,
        edgeClassification,
        atticHeight,
        currentGeometryParams
    };
}

export {
    createAtticGeometry,
    getGeometryState,
    atticSystem,
    buildingFootprintBase,
    roofEnvelope,
    atticCore,
    intakePlenum,
    leftPlenum,
    rightPlenum,
    leftIntakePlacement,
    rightIntakePlacement,
    leftExhaustZone,
    rightExhaustZone,
    leftStaticPlacementLine,
    rightStaticPlacementLine,
    ridgeCenterLine,
    intakeEdgeLine,
    exhaustEdgeLine,
    intakeZones,
    placementReferences,
    edgeClassification,
    atticHeight
};