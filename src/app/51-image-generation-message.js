// ==================== Qwen Image Message Helpers ====================
function createQwenImageMessage(result, request) {
    return {
        role: 'assistant',
        content: '',
        attachments: [{
            type: 'image',
            source: 'qwen-image',
            assetId: result.asset.id,
            url: result.asset.url,
            mime: result.asset.mime,
            width: result.asset.width,
            height: result.asset.height,
            prompt: request.prompt,
            negativePrompt: request.negativePrompt,
            size: request.size,
            promptExtend: request.promptExtend,
            sourceMessageId: String(request.sourceMessageId || ''),
            referenceCharacterName: String(request.referenceCharacterName || ''),
            requestId: result.requestId,
            model: result.model,
            createdAt: Date.now()
        }]
    };
}

function appendQwenImageMessage(conv, message) {
    if (!conv || !Array.isArray(conv.messages)) return;
    conv.messages.push(message);
    conv.updated = Date.now();
    conv._lastRenderedVisibleCount = 0;
    persistState(true);
    renderMessagesOnly();
    renderConversationListOnly();
}
