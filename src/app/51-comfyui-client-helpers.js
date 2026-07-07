// ==================== ComfyUI Client Pure Helpers ====================
function buildComfyPromptWebSocketUrl(server, clientId) {
    return server.replace(/^http/i, 'ws') + '/ws?clientId=' + encodeURIComponent(clientId);
}

function buildComfyPromptHistoryUrl(server, promptId) {
    return server + '/history/' + encodeURIComponent(promptId);
}

function isComfyPromptHistoryComplete(history, promptId) {
    return !!(history && (history[promptId] || history.outputs));
}

function isComfyPromptFinishedMessage(message, promptId) {
    return !!(
        message &&
        message.type === 'executing' &&
        message.data &&
        message.data.prompt_id === promptId &&
        message.data.node === null
    );
}
