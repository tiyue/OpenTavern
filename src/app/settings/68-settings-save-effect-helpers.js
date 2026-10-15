/**
 * 新手导读（文件：68-settings-save-effect-helpers.js）
 *
 * 负责什么：这是“设置界面”中的“设置、保存、联动效果、辅助函数”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `applySavedSettingsThemeEffects(无参数)`、`clearActiveConversationWorldInfoCache(无参数)`、`scheduleAutoSummaryAfterSettingsSave(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 设置副作用辅助：应用主题、性能模式和生成相关配置变化。
function applySavedSettingsThemeEffects() {
    if (typeof applyReadingAppearance === 'function') applyReadingAppearance(state.settings);
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }
    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
    if (state._settingsMessageDisplayChanged) {
        var conv = getActiveConv();
        if (conv) conv._lastRenderedVisibleCount = 0;
        renderMessagesOnly();
        state._settingsMessageDisplayChanged = false;
    }
}

function clearActiveConversationWorldInfoCache() {
    var conv = getActiveConv();
    if (conv) {
        conv._wiCache = null;
    }
}

function scheduleAutoSummaryAfterSettingsSave() {
    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 120);
    }
}
