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
let atticHeight = 0;

// Optional stored params
let currentGeometryParams = null;

function createAtticGeometry({
    buildingWidth = 30,
    buildingLength = 50,
    pitchRise = 6,
    overhangDepth = 16 / 12,   // feet
    plenumHeight = 4 / 12      // feet
} = {}) {
    // Store current params
    currentGeometryParams = {
        buildingWidth,
        buildingLength,
        pitchRise,
        overhangDepth,
        plenumHeight
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
    const pitchRun = 12;
    const halfBuildingWidth = buildingWidth / 2;
    const roofWidth = buildingWidth + (2 * overhangDepth);
    const halfRoofWidth = roofWidth / 2;

    atticHeight = (pitchRise / pitchRun) * halfBuildingWidth;

    // Height of roof at the building edge
    const roofHeightAtBuildingEdge =
        atticHeight * (1 - (halfBuildingWidth / halfRoofWidth));

    const extrudeSettings = {
        depth: buildingLength,
        bevelEnabled: false
    };

    // --------------------------------------------------
    // 1. Roof envelope (hidden construction reference)
    // --------------------------------------------------
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-halfRoofWidth, 0);
    roofShape.lineTo(0, atticHeight);
    roofShape.lineTo(halfRoofWidth, 0);
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
    atticShape.moveTo(-halfBuildingWidth, 0);
    atticShape.lineTo(-halfBuildingWidth, roofHeightAtBuildingEdge);
    atticShape.lineTo(0, atticHeight);
    atticShape.lineTo(halfBuildingWidth, roofHeightAtBuildingEdge);
    atticShape.lineTo(halfBuildingWidth, 0);
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
    leftPlenumShape.moveTo(-halfRoofWidth, 0);
    leftPlenumShape.lineTo(-halfBuildingWidth, 0);
    leftPlenumShape.lineTo(-halfBuildingWidth, roofHeightAtBuildingEdge);
    leftPlenumShape.closePath();

    const rightPlenumShape = new THREE.Shape();
    rightPlenumShape.moveTo(halfBuildingWidth, 0);
    rightPlenumShape.lineTo(halfRoofWidth, 0);
    rightPlenumShape.lineTo(halfBuildingWidth, roofHeightAtBuildingEdge);
    rightPlenumShape.closePath();

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
    const leftIntakeX = -(halfBuildingWidth + (overhangDepth / 2));
    const rightIntakeX = halfBuildingWidth + (overhangDepth / 2);
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

    // --------------------------------------------------
    // 5. Static exhaust placement zones (3 ft downslope)
    // --------------------------------------------------
    const exhaustDownslopeDepth = 3;
    const roofSlopeAngle = Math.atan2(pitchRise, pitchRun);
    const downslopeDx = Math.cos(roofSlopeAngle) * exhaustDownslopeDepth;
    const downslopeDy = Math.sin(roofSlopeAngle) * exhaustDownslopeDepth;

    const createExhaustZoneGeometry = (directionX) => {
        const ridgeNear = new THREE.Vector3(0, atticHeight, -buildingLength / 2);
        const ridgeFar = new THREE.Vector3(0, atticHeight, buildingLength / 2);

        const outerNear = new THREE.Vector3(
            directionX * downslopeDx,
            atticHeight - downslopeDy,
            -buildingLength / 2
        );
        const outerFar = new THREE.Vector3(
            directionX * downslopeDx,
            atticHeight - downslopeDy,
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
    };

    const exhaustZoneMaterial = new THREE.MeshBasicMaterial({
        color: 0xff5a36,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    leftExhaustZone = new THREE.Mesh(createExhaustZoneGeometry(-1), exhaustZoneMaterial.clone());
    leftExhaustZone.name = "leftExhaustZone";
    atticSystem.add(leftExhaustZone);

    rightExhaustZone = new THREE.Mesh(createExhaustZoneGeometry(1), exhaustZoneMaterial.clone());
    rightExhaustZone.name = "rightExhaustZone";
    atticSystem.add(rightExhaustZone);

    // --------------------------------------------------
    // 5.5 Static vent placement lines (centered in 3-foot zones)
    // --------------------------------------------------
    // Placement lines are centered at 1.5 feet downslope from ridge
    const staticPlacementDownslopeDepth = 1.5;
    const staticPlacementDx = Math.cos(roofSlopeAngle) * staticPlacementDownslopeDepth;
    const staticPlacementDy = Math.sin(roofSlopeAngle) * staticPlacementDownslopeDepth;

    const leftStaticPlacementPoints = [
        new THREE.Vector3(-staticPlacementDx, atticHeight - staticPlacementDy, -buildingLength / 2),
        new THREE.Vector3(-staticPlacementDx, atticHeight - staticPlacementDy, buildingLength / 2)
    ];
    const rightStaticPlacementPoints = [
        new THREE.Vector3(staticPlacementDx, atticHeight - staticPlacementDy, -buildingLength / 2),
        new THREE.Vector3(staticPlacementDx, atticHeight - staticPlacementDy, buildingLength / 2)
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
        new THREE.Vector3(0, atticHeight + 0.01, -buildingLength / 2),
        new THREE.Vector3(0, atticHeight + 0.01, buildingLength / 2)
    ];
    ridgeCenterLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ridgePoints),
        new THREE.LineBasicMaterial({ color: 0xffe347 })
    );
    ridgeCenterLine.name = "ridgeCenterLine";
    atticSystem.add(ridgeCenterLine);

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
    atticHeight
};