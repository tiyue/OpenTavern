/**
 * 新手导读（文件：71-event-settings-slider-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、设置、滑块、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindSettingsSlider(slider, valEl, format)`、`bindSummaryMaxWordsInput(无参数)`、`bindSettingsSlidersAndSummaryEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Settings Slider Event Bindings ====================
function bindSettingsSlider(slider, valEl, format) {
    if (!slider || !valEl) return;
    slider.addEventListener('input', function() {
        valEl.textContent = format ? format(this.value) : this.value;
    });
}

function bindSummaryMaxWordsInput() {
    if (!dom.summaryMaxWords) return;
    dom.summaryMaxWords.addEventListener('input', function() {
        getSettingsFormTarget().summaryMaxWords = parseInt(this.value, 10) || 0;
    });
}

function bindSettingsSlidersAndSummaryEvents() {
    bindSettingsSlider(dom.contextLength, dom.contextLenVal);
    bindSettingsSlider(dom.maxTokens, dom.maxTokensVal);
    bindSettingsSlider(dom.temperature, dom.tempVal);
    bindSettingsSlider(dom.frequencyPenalty, dom.frequencyPenaltyVal);
    bindSettingsSlider(dom.presencePenalty, dom.presencePenaltyVal);
    bindSettingsSlider(dom.topP, dom.topPVal);
    bindSettingsSlider(dom.twoStageTemperature, dom.twoStageTempVal);
    bindSettingsSlider(dom.twoStageTopP, dom.twoStageTopPVal);
    bindSettingsSlider(dom.worldInfoBudget, dom.worldInfoBudgetVal);
    bindSettingsSlider(dom.streamTextAnimDuration, dom.streamTextAnimDurationVal);
    bindSettingsSlider(dom.streamTextAnimDistance, dom.streamTextAnimDistanceVal, function(value) { return Number(value).toFixed(2); });
    bindSettingsSlider(dom.streamTextAnimScale, dom.streamTextAnimScaleVal, function(value) { return Number(value).toFixed(2); });
    bindSettingsSlider(dom.streamTextAnimStagger, dom.streamTextAnimStaggerVal);
    bindSettingsSlider(dom.streamIdleTimeoutSec, dom.streamIdleTimeoutVal, formatStreamIdleTimeoutLabel);

    if (dom.contextLength) {
        dom.contextLength.addEventListener('input', updateSummaryThresholdWarning);
    }
    if (dom.summaryThreshold) {
        dom.summaryThreshold.addEventListener('input', function() {
            getSettingsFormTarget().summaryThreshold = parseInt(this.value) || 12;
            if (dom.summaryThresholdVal) {
                dom.summaryThresholdVal.textContent = getSettingsFormTarget().summaryThreshold;
            }
            updateSummaryThresholdWarning();
        });
    }
    if (dom.summaryEnabled) {
        dom.summaryEnabled.addEventListener('change', function() {
            getSettingsFormTarget().summaryEnabled = this.checked;
        });
    }
    bindSummaryMaxWordsInput();

    bindSettingsSlider(dom.summaryThreshold, dom.summaryThresholdVal);
    updateSummaryThresholdWarning();

    if (dom.summarizeUseMainAPI) {
        dom.summarizeUseMainAPI.addEventListener('change', toggleSummarizeCustomSection);
    }
}
