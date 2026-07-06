// ==================== Debounced Persist ====================
var _persistTimeout = null;

function persistState(immediate) {
    const dataToSave = {
        settings: getSafeSettingsForPersist(),
        conversations: state.conversations,
        conversationOrder: state.conversationOrder,
        activeConvId: state.activeConvId,
        worldBooks: state.worldBooks || {},   // Phase 2: persist global world books
        characters: state.characters || {},   // 全局角色卡库
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()                  // 用于双后端冲突解决和判断新鲜度（关键）
    };

    // 【Fix Bug 1】立即缓存快照——即使异步写入尚未完成，pagehide handler
    // 也能在页面关闭时将此快照同步刷写到 LS，防止数据丢失
    if (StorageService) {
        StorageService._lastSaveSnapshot = dataToSave;
    }

    const doPersist = async () => {
        try {
            await StorageService.saveAll(dataToSave);
        } catch (e) {
            // Quota 错误已在 StorageService._handleQuotaExceeded 中处理并导出备份
            if (!StorageService._isQuotaError || !StorageService._isQuotaError(e)) {
                console.error('[persistState] Save error:', e);
            }
        } finally {
            // 【Storage Fix】每次持久化后立即刷新存储用量显示
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
    }, 450);  // 【Storage Fix】轻微加强 debounce
    return Promise.resolve();
}

function getActiveConv() {
    return state.conversations[state.activeConvId];
}

