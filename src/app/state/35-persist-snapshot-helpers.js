
function getActiveConv() {
    return state.conversations[state.activeConvId];
}

function getCloudSyncConversationSignatureBeforePersist() {
    if (_cloudSyncConversationSignature !== null) return _cloudSyncConversationSignature;
    const previousSnapshot = StorageService && StorageService._lastSaveSnapshot;
    return previousSnapshot ? buildCloudSyncConversationSignature(previousSnapshot) : null;
}

function shouldScheduleCloudSyncUploadForPersist(snapshot, options, previousSignature) {
    const signature = buildCloudSyncConversationSignature(snapshot);
    const requestedLastSaved = Number(options && options.lastSaved);
    const skipAutoUpload = !!(
        options &&
        (
            options.preserveLastSaved ||
            options.skipCloudSyncAutoUpload ||
            (Number.isFinite(requestedLastSaved) && requestedLastSaved > 0)
        )
    );
    const baseline = previousSignature === undefined ? getCloudSyncConversationSignatureBeforePersist() : previousSignature;
    if (baseline === null) {
        _cloudSyncConversationSignature = signature;
        return false;
    }

    const changed = signature !== baseline;
    _cloudSyncConversationSignature = signature;
    return changed && !skipAutoUpload;
}

function rememberCloudSyncConversationBaseline(snapshot) {
    _cloudSyncConversationSignature = buildCloudSyncConversationSignature(snapshot || {
        conversations: state.conversations,
        conversationOrder: getPersistableConversationOrder(state.conversationOrder, state.conversations),
        activeConvId: getPersistableActiveConversationId(state.activeConvId, state.conversationOrder, state.conversations)
    });
}

/**
 * 为云同步相关数据生成可比较的字符串“指纹”。
 *
 * 它不是安全哈希，而是稳定排序后的 JSON 字符串；用途只是判断两次保存之间云同步数据是否变化。
 * 临时界面字段和函数会先被移除，否则滚动位置等无关变化也会触发云上传。
 */
function buildCloudSyncConversationSignature(snapshot) {
    try {
        const conversations = snapshot && snapshot.conversations || {};
        return JSON.stringify({
            conversations: getCloudSyncSignatureConversations(conversations),
            conversationOrder: getPersistableConversationOrder(
                snapshot && snapshot.conversationOrder,
                conversations
            ),
            activeConvId: getPersistableActiveConversationId(
                snapshot && snapshot.activeConvId,
                snapshot && snapshot.conversationOrder,
                conversations
            ),
            settings: getCloudSyncSignatureSettings(snapshot && snapshot.settings),
            characters: snapshot && snapshot.characters || {},
            worldBooks: snapshot && snapshot.worldBooks || {},
            charactersMigrated: !!(snapshot && snapshot.charactersMigrated)
        });
    } catch (_) {
        return '';
    }
}

function getCloudSyncSignatureSettings(settings) {
    return getCloudSyncPortableSettings(settings);
}

function getCloudSyncSignatureConversations(conversations) {
    const result = Object.create(null);
    Object.keys(conversations || {}).sort().forEach(function(id) {
        result[id] = sanitizeCloudSyncSignatureConversation(conversations[id]);
    });
    return result;
}

function sanitizeCloudSyncSignatureConversation(conv) {
    if (!conv || typeof conv !== 'object' || Array.isArray(conv)) return conv;
    const clean = Object.create(null);
    Object.keys(conv).sort().forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(CLOUD_SYNC_CONVERSATION_TRANSIENT_KEYS, key)) return;
        var value = conv[key];
        if (typeof value === 'function') return;
        clean[key] = value;
    });
    return clean;
}

function getPersistableConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}

function getPersistableActiveConversationId(activeId, order, conversations) {
    return getValidConversationIdOrFallback(activeId, order, conversations);
}
