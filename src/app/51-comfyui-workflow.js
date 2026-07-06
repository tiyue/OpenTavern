// ==================== ComfyUI Workflow Helpers ====================
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

function buildComfyPromptText(conv) {
    ensureComfySettings();
    var latestAssistant = '';
    if (conv && Array.isArray(conv.messages)) {
        for (var i = conv.messages.length - 1; i >= 0; i--) {
            if (conv.messages[i] && conv.messages[i].role === 'assistant' && conv.messages[i].content) {
                latestAssistant = conv.messages[i].content;
                break;
            }
        }
    }
    var inputText = dom.messageInput ? dom.messageInput.value.trim() : '';
    var scene = inputText || latestAssistant || (conv && conv.title) || '';
    var character = '';
    if (conv) {
        if (isGroupChat(conv)) {
            character = getGroupMembers(conv).map(function(m) {
                return m && m.character ? m.character.name : '';
            }).filter(Boolean).join(', ');
        } else if (conv.character && conv.character.name) {
            character = conv.character.name;
        }
    }
    var text = state.settings.comfyPromptTemplate || '{{scene}}';
    text = text.replace(/\{\{scene\}\}/gi, scene)
        .replace(/\{\{last_assistant\}\}/gi, latestAssistant)
        .replace(/\{\{input\}\}/gi, inputText)
        .replace(/\{\{char\}\}/gi, character)
        .replace(/\{\{user\}\}/gi, state.settings.userName || 'User');
    return text.trim() || scene || character || 'roleplay scene';
}

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

function findComfyOutputImage(history, promptId) {
    var item = history && (history[promptId] || history);
    var outputs = item && item.outputs ? item.outputs : {};
    var nodeIds = Object.keys(outputs || {});
    for (var i = 0; i < nodeIds.length; i++) {
        var images = outputs[nodeIds[i]] && outputs[nodeIds[i]].images;
        if (Array.isArray(images) && images.length > 0) return images[0];
    }
    return null;
}
