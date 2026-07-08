// ==================== Cloud Sync Apply Effects ====================
function persistCloudSyncAppliedSnapshot(data) {
    _cloudSyncSavingStatus = true;
    try { persistState(true, { lastSaved: data && data.lastSaved }); } finally { _cloudSyncSavingStatus = false; }
}

function notifyCloudSyncSnapshotApplied() {
    appStore.notify(['settings', 'conversations', 'characters', 'worldBooks', 'activeConvId']);
    refreshOpenSettingsControlsAfterCloudSyncApply();
    if (typeof requestFullRender === 'function') requestFullRender();
    if (typeof updateInputState === 'function') updateInputState();
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
}

function refreshOpenSettingsControlsAfterCloudSyncApply() {
    if (!isSettingsModalOpenForCloudSyncRefresh()) return;
    if (typeof hydratePrimaryApiSettings === 'function') hydratePrimaryApiSettings();
    if (typeof hydrateGenerationSettings === 'function') hydrateGenerationSettings();
    if (typeof hydratePromptSettings === 'function') hydratePromptSettings();
    if (typeof hydrateTwoStageSettings === 'function') hydrateTwoStageSettings();
    if (typeof hydrateSillyTavernPresetSettings === 'function') hydrateSillyTavernPresetSettings();
    if (typeof hydrateSummarySettings === 'function') hydrateSummarySettings();
    if (typeof hydrateWorldInfoBudgetSettings === 'function') hydrateWorldInfoBudgetSettings();
    if (typeof hydrateThemePerformanceSettings === 'function') hydrateThemePerformanceSettings();
    if (typeof hydrateSummarizationApiSettings === 'function') hydrateSummarizationApiSettings();
    if (typeof hydrateComfySettingsControls === 'function') hydrateComfySettingsControls();
    if (typeof bindWebLLMSettingsControls === 'function') bindWebLLMSettingsControls();
}

function isSettingsModalOpenForCloudSyncRefresh() {
    return !!(
        typeof dom !== 'undefined' &&
        dom.settingsModal &&
        dom.settingsModal.classList &&
        !dom.settingsModal.classList.contains('hidden')
    );
}
