var backupRestorePending = false;
var storageReplacementActive = 0;

function isBackupRestorePending() { return backupRestorePending; }

function beginStorageReplacement() {
    if (backupRestorePending || storageReplacementActive > 0 || typeof cloudSyncActiveOperations !== 'undefined' && cloudSyncActiveOperations > 0) throw new Error('另一项恢复、清空或云同步正在进行，请完成后重试。');
    storageReplacementActive++;
    return function() { storageReplacementActive--; };
}

function assertBackupRestorePlanCurrent(plan) {
    Object.keys(plan.roots).forEach(function(key) {
        if (state[key] !== plan.roots[key]) throw new Error('数据已被其他恢复或清空操作替换，请重新预览。');
    });
    Object.keys(plan.settingsPatch).forEach(function(key) {
        if (!backupEqual(state.settings[key], plan.baselineSettings[key])) throw new Error('选中的设置已变化，请重新预览。');
    });
    [['apiEndpoint', 'apiKey'], ['summarizeApiEndpoint', 'summarizeApiKey']].forEach(function(pair) {
        if (backupHas(plan.settingsPatch, pair[0]) && String(state.settings[pair[1]] || '') && !backupEqual(plan.settingsPatch[pair[0]], state.settings[pair[0]])) throw new Error('本机 API 凭据已变化，请重新预览恢复。');
    });
    ['conversations', 'characters', 'worldBooks'].forEach(function(key) {
        Object.keys(plan.additions[key]).forEach(function(id) {
            if (backupHas(state[key], id)) throw new Error('恢复目标 ID 已被其他操作使用，请重新预览。');
        });
    });
    plan.dependencies.forEach(function(item) {
        if (!backupEqual(state[item.container] && state[item.container][item.key], item.value)) throw new Error('会话依赖的数据已变化，请重新预览。');
    });
}

function applyBackupRestorePlanToSnapshot(snapshot, plan) {
    ['conversations', 'characters', 'worldBooks'].forEach(function(key) {
        if (!plan.selection[key]) return;
        if (!snapshot[key]) snapshot[key] = {};
        Object.keys(plan.additions[key]).forEach(function(id) { backupSet(snapshot[key], id, backupClone(plan.additions[key][id])); });
    });
    Object.keys(plan.settingsPatch).forEach(function(key) { backupSet(snapshot.settings, key, backupClone(plan.settingsPatch[key])); });
    if (plan.selection.presets) ensurePresetLibrary(snapshot.settings);
    if (plan.selection.characters) snapshot.charactersMigrated = !!(snapshot.charactersMigrated || plan.charactersMigrated);
    if (plan.selection.conversations) {
        snapshot.conversationOrder = getConversationIdsWithMissingFallback(plan.order.concat(snapshot.conversationOrder || []), snapshot.conversations);
        if (plan.activeId && snapshot.activeConvId === plan.beforeActive && !state.isGenerating) snapshot.activeConvId = plan.activeId;
        snapshot.activeConvId = getValidConversationIdOrFallback(snapshot.activeConvId, snapshot.conversationOrder, snapshot.conversations);
    }
    return snapshot;
}

async function commitBackupRestorePlan(plan) {
    if (!Object.values(plan.selection).some(Boolean)) throw new Error('请至少选择一项。');
    if (backupRestorePending) throw new Error('另一项恢复正在保存。');
    if (storageReplacementActive > 0) throw new Error('存储恢复或清空正在进行，请完成后重新预览。');
    if (typeof cloudSyncActiveOperations !== 'undefined' && cloudSyncActiveOperations > 0) throw new Error('云同步正在进行，请完成后重新预览恢复。');
    assertBackupRestorePlanCurrent(plan);
    backupRestorePending = true;
    var hadScheduledUpload = typeof _cloudSyncUploadTimer !== 'undefined' && !!_cloudSyncUploadTimer;
    if (hadScheduledUpload) { clearTimeout(_cloudSyncUploadTimer); _cloudSyncUploadTimer = null; }
    var committed = false;
    try {
        await persistState(true, {
            throwOnError: true, skipCloudSyncAutoUpload: true,
            transformSnapshot: function(snapshot) { return applyBackupRestorePlanToSnapshot(snapshot, plan); },
            beforePersist: function() { assertBackupRestorePlanCurrent(plan); },
            onPersistSuccess: function() {
                assertBackupRestorePlanCurrent(plan);
                var applied = applyBackupRestorePlanToSnapshot({ settings: state.settings, conversations: state.conversations, characters: state.characters, worldBooks: state.worldBooks, conversationOrder: state.conversationOrder, activeConvId: state.activeConvId, charactersMigrated: state._charactersMigrated }, plan);
                if (plan.selection.conversations) { state.conversations = applied.conversations; state.conversationOrder = applied.conversationOrder; state.activeConvId = applied.activeConvId; }
                if (plan.selection.characters) { state.characters = applied.characters; state._charactersMigrated = applied.charactersMigrated; }
                if (plan.selection.worldBooks) state.worldBooks = applied.worldBooks;
                committed = true;
            },
            commitPendingSnapshot: function(snapshot) { applyBackupRestorePlanToSnapshot(snapshot, plan); }
        });
    } finally {
        backupRestorePending = false;
        if (!committed && hadScheduledUpload && typeof scheduleCloudSyncUpload === 'function') {
            try { scheduleCloudSyncUpload(); } catch (error) { reportPersistPostSaveError('backup restore upload scheduling', error); }
        }
    }
    if (committed) {
        try {
            if (plan.selection.settings && typeof settingsFormDraft !== 'undefined' && settingsFormDraft) discardSettingsDraft();
            if (typeof applyUiTheme === 'function') applyUiTheme(state.settings.uiTheme);
            if (typeof applyReadingAppearance === 'function') applyReadingAppearance(state.settings);
            appStore.notify(['settings', 'conversations', 'characters', 'worldBooks', 'activeConvId']);
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
            if (typeof renderMyCards === 'function') renderMyCards();
            if (typeof requestFullRender === 'function') requestFullRender();
            if (typeof updateInputState === 'function') updateInputState();
        } catch (error) { reportPersistPostSaveError('backup restore interface refresh', error); }
        if (typeof scheduleCloudSyncUpload === 'function') {
            try { scheduleCloudSyncUpload(); } catch (error) { reportPersistPostSaveError('backup restore upload scheduling', error); }
        }
    }
    return committed;
}
