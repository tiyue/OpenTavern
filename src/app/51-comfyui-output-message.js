// ==================== ComfyUI Output Message Helpers ====================
function buildComfyImageViewUrl(server, image) {
    return server + '/view?filename=' + encodeURIComponent(image.filename || '') +
        '&subfolder=' + encodeURIComponent(image.subfolder || '') +
        '&type=' + encodeURIComponent(image.type || 'output');
}

async function loadComfyOutputImageDataUrl(server, image) {
    return await fetchBlobAsDataUrl(buildComfyImageViewUrl(server, image));
}

function createComfyImageMessage(dataUrl, promptText, promptId, image) {
    return {
        role: 'assistant',
        content: '',
        attachments: [{
            type: 'image',
            source: 'comfyui',
            mime: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png',
            dataUrl: dataUrl,
            prompt: promptText,
            comfyPromptId: promptId,
            filename: image.filename || '',
            createdAt: Date.now()
        }]
    };
}

function appendComfyImageMessage(conv, msg) {
    conv.messages.push(msg);
    conv.updated = Date.now();
    conv._lastRenderedVisibleCount = 0;
    persistState();
    renderMessagesOnly();
    renderConversationListOnly();
}
