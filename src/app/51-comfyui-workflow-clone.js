// ==================== ComfyUI Workflow Clone ====================
function cloneComfyWorkflow() {
    ensureComfySettings();
    if (!state.settings.comfyWorkflow || typeof state.settings.comfyWorkflow !== 'object') {
        throw new Error(t('comfy_error_no_workflow'));
    }
    return JSON.parse(JSON.stringify(state.settings.comfyWorkflow));
}

function setComfyNodeInput(workflow, nodeId, inputName, value) {
    if (!nodeId) return false;
    var node = workflow[String(nodeId)];
    if (!node || !node.inputs || !(inputName in node.inputs)) return false;
    node.inputs[inputName] = value;
    return true;
}
