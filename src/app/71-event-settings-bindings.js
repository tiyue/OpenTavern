// ==================== Settings Event Bindings ====================
function bindSettingsSlider(slider, valEl, format) {
    if (!slider || !valEl) return;
    slider.addEventListener('input', function() {
        valEl.textContent = format ? format(this.value) : this.value;
    });
}

function bindSettingsModalEvents() {
    if (dom.sidebarSettingsBtn) dom.sidebarSettingsBtn.addEventListener('click', openSettings);
    if (dom.topSettingsBtn) dom.topSettingsBtn.addEventListener('click', openSettings);
    if (dom.settingsCloseBtn) dom.settingsCloseBtn.addEventListener('click', closeSettings);
    if (dom.settingsBackdrop) dom.settingsBackdrop.addEventListener('click', closeSettings);
}

function bindSettingsIntegrationEvents() {
    if (dom.stPresetImportBtn) dom.stPresetImportBtn.addEventListener('click', function() {
        if (dom.stPresetImportFile) dom.stPresetImportFile.click();
    });
    if (dom.stPresetImportFile) dom.stPresetImportFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importSillyTavernPresetFile(file);
    });
    if (dom.stPresetExportBtn) dom.stPresetExportBtn.addEventListener('click', exportSillyTavernPreset);
    if (dom.stPresetDeleteBtn) dom.stPresetDeleteBtn.addEventListener('click', deleteSillyTavernPreset);

    if (dom.comfyImportWorkflowBtn) dom.comfyImportWorkflowBtn.addEventListener('click', function() {
        if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.click();
    });
    if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importComfyWorkflowFile(file);
    });
    if (dom.comfyTestBtn) dom.comfyTestBtn.addEventListener('click', testComfyConnection);
}

function bindSettingsSlidersAndSummaryEvents() {
    bindSettingsSlider(dom.contextLength, dom.contextLenVal);
    bindSettingsSlider(dom.maxTokens, dom.maxTokensVal);
    bindSettingsSlider(dom.temperature, dom.tempVal);
    bindSettingsSlider(dom.topP, dom.topPVal);
    bindSettingsSlider(dom.twoStageTemperature, dom.twoStageTempVal);
    bindSettingsSlider(dom.twoStageTopP, dom.twoStageTopPVal);
    bindSettingsSlider(dom.worldInfoBudget, dom.worldInfoBudgetVal);

    if (dom.contextLength) {
        dom.contextLength.addEventListener('input', updateSummaryThresholdWarning);
    }
    if (dom.summaryThreshold) {
        dom.summaryThreshold.addEventListener('input', function() {
            state.settings.summaryThreshold = parseInt(this.value) || 12;
            if (dom.summaryThresholdVal) {
                dom.summaryThresholdVal.textContent = state.settings.summaryThreshold;
            }
            updateSummaryThresholdWarning();
        });
    }
    if (dom.summaryEnabled) {
        dom.summaryEnabled.addEventListener('change', function() {
            state.settings.summaryEnabled = this.checked;
        });
    }

    bindSettingsSlider(dom.summaryThreshold, dom.summaryThresholdVal);
    updateSummaryThresholdWarning();

    if (dom.summarizeUseMainAPI) {
        dom.summarizeUseMainAPI.addEventListener('change', toggleSummarizeCustomSection);
    }
}

function bindSettingsEvents() {
    bindSettingsModalEvents();
    bindSettingsIntegrationEvents();
    bindSettingsSlidersAndSummaryEvents();
}
