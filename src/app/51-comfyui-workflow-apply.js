// ==================== ComfyUI Workflow Apply ====================
function applyComfyPromptToWorkflow(workflow, promptText) {
    ensureComfySettings();
    var posId = String(state.settings.comfyPositiveNodeId || '').trim();
    var negId = String(state.settings.comfyNegativeNodeId || '').trim();
    var seedId = String(state.settings.comfySeedNodeId || '').trim();
    if (!setComfyNodeInput(workflow, posId, 'text', promptText)) {
        throw new Error(t('comfy_error_positive_node'));
    }
    if (negId) setComfyNodeInput(workflow, negId, 'text', state.settings.comfyNegativePrompt || '');
    if (seedId) {
        var node = workflow[seedId];
        if (node && node.inputs) {
            if ('seed' in node.inputs) node.inputs.seed = Math.floor(Math.random() * 9007199254740991);
            else if ('noise_seed' in node.inputs) node.inputs.noise_seed = Math.floor(Math.random() * 9007199254740991);
        }
    }
}
