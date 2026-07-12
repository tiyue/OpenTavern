/**
 * 新手导读（文件：22-cloud-sync-apply-effects.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、应用数据、联动效果”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `persistCloudSyncAppliedSnapshot(data)`、`notifyCloudSyncSnapshotApplied(无参数)`、`refreshOpenSettingsControlsAfterCloudSyncApply(无参数)`、`isSettingsModalOpenForCloudSyncRefresh(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
