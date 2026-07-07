// ==================== Settings Slider Event Bindings ====================
function bindSettingsSlider(slider, valEl, format) {
    if (!slider || !valEl) return;
    slider.addEventListener('input', function() {
        valEl.textContent = format ? format(this.value) : this.value;
    });
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
