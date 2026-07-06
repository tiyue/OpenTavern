// ==================== Settings Modal ====================
function updateSummaryThresholdWarning() {
    if (!dom.summaryThreshold || !dom.contextLength) return;
    var warning = document.getElementById('summaryThresholdWarning');
    if (!warning) return;

    var threshold = parseInt(dom.summaryThreshold.value) || 0;
    var ctxLen = parseInt(dom.contextLength.value) || 0;
    if (threshold > ctxLen) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

function toggleSummarizeCustomSection() {
    var useMain = !!(dom.summarizeUseMainAPI && dom.summarizeUseMainAPI.checked);
    if (dom.summarizeCustomApiSection) {
        dom.summarizeCustomApiSection.style.display = useMain ? 'none' : '';
    }
}

// Settings modal
function openSettings() {
    applyTranslations();
    hydratePrimaryApiSettings();
    hydrateGenerationSettings();
    hydratePromptSettings();
    hydrateTwoStageSettings();
    hydrateSillyTavernPresetSettings();
    hydrateSummarySettings();
    hydrateWorldInfoBudgetSettings();
    hydrateThemePerformanceSettings();
    hydrateSummarizationApiSettings();
    hydrateComfySettingsControls();
    hydrateCloudSyncSettingsControls();
    toggleSummarizeCustomSection();
    bindWebLLMSettingsControls();
    bindSettingsStorageControls();
    dom.settingsModal.classList.remove('hidden');
}
