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
            )
        });
    } catch (_) {
        return '';
    }
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
