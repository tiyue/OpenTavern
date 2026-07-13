/**
 * 新手导读（文件：35-state-persistence.js）
 *
 * 负责什么：这是“状态持久化”中的“状态、持久化”部分。
 * 在程序中的位置：它把内存中的应用状态整理成可保存快照，并安排实际写入。
 * 从哪里开始看：主要从 `persistState(immediate, options)`、`getActiveConv(无参数)`、`getCloudSyncConversationSignatureBeforePersist(无参数)`、`shouldScheduleCloudSyncUploadForPersist(snapshot, options, previousSignature)`、`rememberCloudSyncConversationBaseline(snapshot)`、`buildCloudSyncConversationSignature(snapshot)`，以及另外 4 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：要避免高频重复写盘，同时不能漏掉用户刚刚完成的修改。
 */
// ==================== Debounced Persist ====================
var _persistTimeout = null;
var _cloudSyncConversationSignature = null;
const CLOUD_SYNC_CONVERSATION_TRANSIENT_KEYS = {
    _forcedSpeaker: true,
    _historyScrollHandler: true,
    _historyWindow: true,
    _lastRenderedVisibleCount: true,
    _nextGroupSpeaker: true,
    _showAllMessages: true,
    _wiBudgetWarning: true,
    _wiCache: true,
    _wiTimedEffects: true
};

/**
 * 把当前全局 state 保存到浏览器存储，并在确有会话变化时安排自动云同步。
 *
 * @param {boolean} immediate - true 表示立即写入；false 表示等待 450 毫秒，把连续修改合并成一次写入。
 * @param {Object} options - 保存细节，例如保留旧时间戳、跳过自动上传或指定 lastSaved。
 * @returns {Promise<void>} 写入已完成或已成功加入延迟队列时结束的 Promise。
 *
 * 为什么要延迟：用户输入或拖动控件时可能在一秒内触发很多次保存，逐次写盘既慢又磨损资源。
 * 为什么仍保留 immediate：发送消息、导入数据等关键节点需要确保最新状态尽快落盘。
 * finally 中的云同步判断即使本地保存报错也会执行状态刷新，但只有会话签名真正变化才上传。
 */
function persistState(immediate, options) {
    options = options || {};
    const previousLastSaved = Number(StorageService && StorageService._lastSaveSnapshot && StorageService._lastSaveSnapshot.lastSaved || 0) || 0;
    const requestedLastSaved = Number(options.lastSaved);
    const hasRequestedLastSaved = Number.isFinite(requestedLastSaved) && requestedLastSaved > 0;
    const snapshotLastSaved = hasRequestedLastSaved
        ? requestedLastSaved
        : (options.preserveLastSaved && previousLastSaved ? previousLastSaved : Date.now());
    const dataToSave = {
        settings: getSafeSettingsForPersist(),
        conversations: state.conversations,
        conversationOrder: getPersistableConversationOrder(state.conversationOrder, state.conversations),
        activeConvId: getPersistableActiveConversationId(state.activeConvId, state.conversationOrder, state.conversations),
        worldBooks: state.worldBooks || {},
        characters: state.characters || {},
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: snapshotLastSaved
    };
    const cloudSyncConversationSignatureBeforePersist = getCloudSyncConversationSignatureBeforePersist();

    if (StorageService) {
        StorageService._lastSaveSnapshot = dataToSave;
    }

    const doPersist = async () => {
        try {
            await StorageService.saveAll(dataToSave);
        } catch (e) {
            if (!StorageService._isQuotaError || !StorageService._isQuotaError(e)) {
                console.error('[persistState] Save error:', e);
            }
        } finally {
            if (typeof updateStorageInfo === 'function') {
                updateStorageInfo();
            }
            const shouldAutoCloudSync = shouldScheduleCloudSyncUploadForPersist(
                dataToSave,
                options,
                cloudSyncConversationSignatureBeforePersist
            );
            if (shouldAutoCloudSync && typeof scheduleCloudSyncUpload === 'function') {
                scheduleCloudSyncUpload();
            }
        }
    };

    if (immediate) {
        if (_persistTimeout) {
            clearTimeout(_persistTimeout);
            _persistTimeout = null;
        }
        return doPersist();
    }

    if (_persistTimeout) clearTimeout(_persistTimeout);

    _persistTimeout = setTimeout(function() {
        doPersist();
        _persistTimeout = null;
    }, 450);
    return Promise.resolve();
}

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
    var clean = JSON.parse(JSON.stringify(settings || {}));
    clean.apiKey = '';
    clean.summarizeApiKey = '';
    clean.imageGenerationToken = '';
    clean.cloudSyncToken = '';
    clean.cloudSyncPassphrase = '';
    clean.cloudSyncLastAt = 0;
    clean.cloudSyncLastStatus = '';
    return clean;
}

function getCloudSyncSignatureConversations(conversations) {
    const result = {};
    Object.keys(conversations || {}).sort().forEach(function(id) {
        result[id] = sanitizeCloudSyncSignatureConversation(conversations[id]);
    });
    return result;
}

function sanitizeCloudSyncSignatureConversation(conv) {
    if (!conv || typeof conv !== 'object' || Array.isArray(conv)) return conv;
    const clean = {};
    Object.keys(conv).sort().forEach(function(key) {
        if (CLOUD_SYNC_CONVERSATION_TRANSIENT_KEYS[key]) return;
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
