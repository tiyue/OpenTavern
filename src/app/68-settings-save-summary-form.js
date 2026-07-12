/**
 * 新手导读（文件：68-settings-save-summary-form.js）
 *
 * 负责什么：这是“设置界面”中的“设置、保存、总结、表单”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `readSummarySettingsFromForm(无参数)`、`readWorldInfoBudgetSettingsFromForm(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// ==================== Settings Save Summary Form ====================
function readSummarySettingsFromForm() {
    ensureSillyTavernPresetSettings();
    state.settings.summaryEnabled = readCheckboxControlValue(dom.summaryEnabled, false);
    if (dom.summaryThreshold) state.settings.summaryThreshold = readIntegerControlValue(dom.summaryThreshold, 12);
    if (dom.summaryMaxWords) state.settings.summaryMaxWords = readIntegerControlValue(dom.summaryMaxWords, 0);
    if (dom.summaryPrompt) state.settings.summaryPrompt = readTrimmedControlValue(dom.summaryPrompt);
}

function readWorldInfoBudgetSettingsFromForm() {
    state.settings.worldInfoBudgetEnabled = readCheckboxControlValue(dom.worldInfoBudgetEnabled, false);
    state.settings.worldInfoBudget = readIntegerControlValue(dom.worldInfoBudget, 2048);
}
