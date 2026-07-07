// ==================== Debounced Persist ====================
var _persistTimeout = null;

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
            if (typeof scheduleCloudSyncUpload === 'function') {
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
