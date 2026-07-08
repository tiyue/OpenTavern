// ==================== Debounced Persist ====================
var _persistTimeout = null;
var _cloudSyncConversationSignature = null;

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
        conversationOrder: state.conversationOrder,
        activeConvId: state.activeConvId,
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
        conversationOrder: state.conversationOrder,
        activeConvId: state.activeConvId
    });
}

function buildCloudSyncConversationSignature(snapshot) {
    try {
        return JSON.stringify({
            conversations: snapshot && snapshot.conversations || {},
            conversationOrder: Array.isArray(snapshot && snapshot.conversationOrder) ? snapshot.conversationOrder : [],
            activeConvId: snapshot && snapshot.activeConvId || null
        });
    } catch (_) {
        return '';
    }
}
