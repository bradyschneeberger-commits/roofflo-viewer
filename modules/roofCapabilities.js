const SUPPORTED_ROOF_TYPES = ["gable", "shed", "hip"];

const ROOF_TYPE_CAPABILITIES = {
    gable: {
        placement: {
            intake: true,
            static: true,
            ridge: { requiresRidgeReference: true }
        },
        presets: {
            intakeOnly: true,
            exhaustOnly: true,
            balanced: true
        },
        restore: {
            intake: true,
            static: true,
            ridge: { requiresRidgeReference: true }
        },
        references: {
            intakeTargets: true,
            staticTargets: true,
            ridgeReference: { requiredFor: ["placement", "restore", "presets"] }
        }
    },
    shed: {
        placement: {
            intake: true,
            static: true,
            ridge: false
        },
        presets: {
            intakeOnly: true,
            exhaustOnly: true,
            balanced: true
        },
        restore: {
            intake: true,
            static: true,
            ridge: false
        },
        references: {
            intakeTargets: true,
            staticTargets: true,
            ridgeReference: false
        }
    },
    hip: {
        placement: {
            intake: true,
            static: true,
            ridge: { requiresRidgeReference: true }
        },
        presets: {
            intakeOnly: false,
            exhaustOnly: false,
            balanced: false
        },
        restore: {
            intake: true,
            static: true,
            ridge: { requiresRidgeReference: true }
        },
        references: {
            intakeTargets: true,
            staticTargets: true,
            ridgeReference: { requiredFor: ["placement", "restore"] }
        }
    }
};

function normalizeRoofType(roofType) {
    const normalized = String(roofType || "").trim().toLowerCase();
    if (!normalized) {
        throw new Error("[RoofFlo Capability Matrix] roofType is required.");
    }

    if (!Object.prototype.hasOwnProperty.call(ROOF_TYPE_CAPABILITIES, normalized)) {
        throw new Error(
            `[RoofFlo Capability Matrix] Unsupported roofType '${normalized}'. Supported: ${SUPPORTED_ROOF_TYPES.join(", ")}.`
        );
    }

    return normalized;
}

function getRoofTypeCapabilities(roofType) {
    const normalized = normalizeRoofType(roofType);
    return ROOF_TYPE_CAPABILITIES[normalized];
}

function resolveConditionalCapability(value, context = {}) {
    if (typeof value === "boolean") {
        return value;
    }

    if (!value || typeof value !== "object") {
        return false;
    }

    if (value.requiresRidgeReference) {
        return Boolean(context.hasRidgeReference);
    }

    return false;
}

function isPlacementModeSupported(roofType, mode, context = {}) {
    const capabilities = getRoofTypeCapabilities(roofType);
    if (!Object.prototype.hasOwnProperty.call(capabilities.placement, mode)) {
        return false;
    }

    return resolveConditionalCapability(capabilities.placement[mode], context);
}

function isPresetSupported(roofType, presetType) {
    const capabilities = getRoofTypeCapabilities(roofType);
    return Boolean(capabilities.presets[presetType]);
}

function isRestoreFeatureSupported(roofType, feature, context = {}) {
    const capabilities = getRoofTypeCapabilities(roofType);
    if (!Object.prototype.hasOwnProperty.call(capabilities.restore, feature)) {
        return false;
    }

    return resolveConditionalCapability(capabilities.restore[feature], context);
}

export {
    SUPPORTED_ROOF_TYPES,
    ROOF_TYPE_CAPABILITIES,
    getRoofTypeCapabilities,
    isPlacementModeSupported,
    isPresetSupported,
    isRestoreFeatureSupported
};
