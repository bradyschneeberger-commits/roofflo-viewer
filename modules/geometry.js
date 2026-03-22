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

// Geometry references
let atticSystem = null;
let buildingFootprintBase = null;
let roofEnvelope = null;
let atticCore = null;
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
    const roofHeightAtBuildingEdgeRight = slopePerFoot * (buildingWidth + overhangDepth);
    const roofHeightAtRightOverhang = roofHeightAtBuildingEdgeRight;
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
        ridgeX: highWallX,
        ridgeY: roofHeightAtBuildingEdgeRight,
        roofSlopeAngle: Math.atan2(pitchRise, 12),
        staticPlacement: {
            leftDownslope: 4.5,
            rightDownslope: 1.5
        },
        exhaustBands: {
            left: { inner: 3, outer: 6 },
            right: { inner: 0, outer: 3 }
        },
        intakePlacementX: {
            left: -(halfBuildingWidth + (overhangDepth / 2)),
            right: highWallX
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
        edgeReferenceX: {
            intake: lowEaveX,
            exhaust: highWallX
        }
    };
}

function createHipRoof(params) {
    // Placeholder until dedicated hip geometry is implemented.
    return createGableRoof(params);
}

function createAtticGeometry({
    buildingWidth = 30,
    buildingLength = 50,
    pitchRise = 6,
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
    const roofWidth = buildingWidth + (2 * overhangDepth);
    const halfRoofWidth = roofWidth / 2;

    const normalizedRoofType = String(roofType || "gable").toLowerCase();
    const roofBuilder = normalizedRoofType === "shed"
        ? createShedRoof
        : (normalizedRoofType === "hip" ? createHipRoof : createGableRoof);

    const roofProfile = roofBuilder({
        pitchRise,
        buildingWidth,
        overhangDepth,
        roofWidth,
        halfBuildingWidth,
        halfRoofWidth
    });

    atticHeight = roofProfile.atticHeight;
    const roofHeightAtBuildingEdgeLeft = roofProfile.roofHeightAtBuildingEdgeLeft;
    const roofHeightAtBuildingEdgeRight = roofProfile.roofHeightAtBuildingEdgeRight;
    const roofHeightAtLeftOverhang = roofProfile.roofHeightAtLeftOverhang;
    const roofHeightAtRightOverhang = roofProfile.roofHeightAtRightOverhang;
    const ridgeX = roofProfile.ridgeX;
    const ridgeY = roofProfile.ridgeY;
    currentGeometryParams.roofEdgeRoles = roofProfile.edgeRoles || null;
    currentGeometryParams.primaryIntakeReference = roofProfile.roofType === "shed"
        ? "intakeEdgeLine"
        : "leftIntakePlacement";
    currentGeometryParams.primaryExhaustReference = roofProfile.roofType === "shed"
        ? "exhaustEdgeLine"
        : "ridgeCenterLine";

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
        const highWallChannelInset = Math.max(Math.min(overhangDepth * 0.2, 0.35), 0.16);
        const highWallInnerX = halfBuildingWidth - highWallChannelInset;
        const highWallInnerY = roofHeightAtBuildingEdgeRight - (Math.tan(roofSlopeAngle) * highWallChannelInset);

        leftPlenumShape.moveTo(lowEaveX, 0);
        leftPlenumShape.lineTo(-halfBuildingWidth, 0);
        leftPlenumShape.lineTo(-halfBuildingWidth, lowSideChannelHeight);
        leftPlenumShape.lineTo(lowEaveX, lowSideChannelHeight);
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

    const rightPlenumGeometry = new THREE.ExtrudeGeometry(rightPlenumShape, extrudeSettings);
    rightPlenumGeometry.translate(0, 0, -buildingLength / 2);

    const plenumMaterial = new THREE.MeshStandardMaterial({
        color: 0x2255ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    leftPlenum = new THREE.Mesh(leftPlenumGeometry, plenumMaterial);
    leftPlenum.name = "leftPlenum";
    atticSystem.add(leftPlenum);

    const leftPlenumEdges = new THREE.EdgesGeometry(leftPlenumGeometry);
    const leftPlenumEdgeLines = new THREE.LineSegments(
        leftPlenumEdges,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    leftPlenum.add(leftPlenumEdgeLines);

    rightPlenum = new THREE.Mesh(rightPlenumGeometry, plenumMaterial);
    rightPlenum.name = "rightPlenum";
    atticSystem.add(rightPlenum);

    const rightPlenumEdges = new THREE.EdgesGeometry(rightPlenumGeometry);
    const rightPlenumEdgeLines = new THREE.LineSegments(
        rightPlenumEdges,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    rightPlenum.add(rightPlenumEdgeLines);

    // --------------------------------------------------
    // 4. Intake placement references (underside centerlines)
    // --------------------------------------------------
    const leftIntakeX = roofProfile.intakePlacementX?.left ?? -(halfBuildingWidth + (overhangDepth / 2));
    const rightIntakeX = roofProfile.intakePlacementX?.right ?? (halfBuildingWidth + (overhangDepth / 2));
    const intakeY = 0.02;

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

    const intakeEdgeReferenceX = roofProfile.edgeReferenceX?.intake ?? leftIntakeX;
    const intakeEdgePoints = [
        new THREE.Vector3(intakeEdgeReferenceX, 0.02, -buildingLength / 2),
        new THREE.Vector3(intakeEdgeReferenceX, 0.02, buildingLength / 2)
    ];
    intakeEdgeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(intakeEdgePoints),
        new THREE.LineBasicMaterial({ color: 0x66f7ff })
    );
    intakeEdgeLine.name = "intakeEdgeLine";
    atticSystem.add(intakeEdgeLine);

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
            ridgeX - innerDx,
            ridgeY - innerDy,
            -buildingLength / 2
        );
        const innerFar = new THREE.Vector3(
            ridgeX - innerDx,
            ridgeY - innerDy,
            buildingLength / 2
        );

        const outerNear = new THREE.Vector3(
            ridgeX - outerDx,
            ridgeY - outerDy,
            -buildingLength / 2
        );
        const outerFar = new THREE.Vector3(
            ridgeX - outerDx,
            ridgeY - outerDy,
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

    const leftExhaustGeometry = roofProfile.roofType === "shed"
        ? createShedExhaustZoneGeometry(roofProfile.exhaustBands.left.inner, roofProfile.exhaustBands.left.outer)
        : createGableExhaustZoneGeometry(-1);
    const rightExhaustGeometry = roofProfile.roofType === "shed"
        ? createShedExhaustZoneGeometry(roofProfile.exhaustBands.right.inner, roofProfile.exhaustBands.right.outer)
        : createGableExhaustZoneGeometry(1);

    leftExhaustZone = new THREE.Mesh(leftExhaustGeometry, exhaustZoneMaterial.clone());
    leftExhaustZone.name = "leftExhaustZone";
    atticSystem.add(leftExhaustZone);

    rightExhaustZone = new THREE.Mesh(rightExhaustGeometry, exhaustZoneMaterial.clone());
    rightExhaustZone.name = "rightExhaustZone";
    atticSystem.add(rightExhaustZone);

    // --------------------------------------------------
    // 5.5 Static vent placement lines (centered in 3-foot zones)
    // --------------------------------------------------
    // Placement lines are centered downslope from ridge/high-side reference
    const leftStaticDx = Math.cos(roofSlopeAngle) * roofProfile.staticPlacement.leftDownslope;
    const leftStaticDy = Math.sin(roofSlopeAngle) * roofProfile.staticPlacement.leftDownslope;
    const rightStaticDx = Math.cos(roofSlopeAngle) * roofProfile.staticPlacement.rightDownslope;
    const rightStaticDy = Math.sin(roofSlopeAngle) * roofProfile.staticPlacement.rightDownslope;

    const leftStaticX = ridgeX - leftStaticDx;
    const rightStaticX = roofProfile.roofType === "shed" ? ridgeX - rightStaticDx : ridgeX + rightStaticDx;
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

    // --------------------------------------------------
    // 6. Ridge centerline reference
    // --------------------------------------------------
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

    const exhaustEdgeReferenceX = roofProfile.edgeReferenceX?.exhaust ?? ridgeX;
    const exhaustEdgeReferenceY = roofProfile.roofType === "shed"
        ? roofHeightAtBuildingEdgeRight + 0.01
        : ridgeY + 0.01;
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

    return {
        atticSystem,
        buildingFootprintBase,
        roofEnvelope,
        atticCore,
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
    atticHeight
};