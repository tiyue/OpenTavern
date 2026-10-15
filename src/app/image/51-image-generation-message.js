// ==================== Image Generation Message Helpers ====================
function createImageGenerationMessage(result, request) {
    return {
        role: 'assistant',
        content: '',
        attachments: [{
            type: 'image',
            source: 'packy-gpt-image',
            assetId: result.asset.id,
            url: result.asset.url,
            mime: result.asset.mime,
            width: result.asset.width,
            height: result.asset.height,
            prompt: request.prompt,
            size: request.size,
            sourceMessageId: String(request.sourceMessageId || ''),
            referenceCharacterName: String(request.referenceCharacterName || ''),
            requestId: result.requestId,
            model: result.model,
            provider: result.provider,
            createdAt: Date.now()
        }]
    };
}

function appendImageGenerationMessage(conv, message) {
    if (!conv || !Array.isArray(conv.messages)) return;
    conv.messages.push(message);
    normalizeConversationMessageIdentity(conv);
    conv.updated = Date.now();
    conv._lastRenderedVisibleCount = 0;
    // 原始消息保存必须如实暴露失败：写盘失败时不得继续本地化，避免在未落盘的消息上追加字节。
    var saved = persistState(true, { throwOnError: true });
    renderMessagesOnly();
    renderConversationListOnly();
    scheduleImageGenerationMediaPreparation(conv.id, message.id, saved);
}

// 新生成图片先按原流程保存；落盘后再异步补一份本地字节，失败不影响消息与渲染。
function scheduleImageGenerationMediaPreparation(convId, messageId, saved) {
    var persisted = saved && typeof saved.then === 'function' ? saved : Promise.resolve();
    // 保存失败时 persisted 会拒绝：先吞掉拒绝，既不产生未处理的 Promise，也确保不会在写盘失败后继续本地化。
    persisted.then(function() {
        if (!convId || !messageId) return;
        if (typeof PrivateMediaLocal === 'undefined' || !PrivateMediaLocal || typeof PrivateMediaLocal.prepareMessage !== 'function') return;
        return PrivateMediaLocal.prepareMessage(convId, messageId);
    }).catch(function() {});
}

// Compatibility aliases for old extensions and cached bundles.
function createQwenImageMessage(result, request) {
    return createImageGenerationMessage(result, request);
}

function appendQwenImageMessage(conv, message) {
    return appendImageGenerationMessage(conv, message);
}
