/**
 * 新手导读（文件：68-settings-save-main-form.js）
 *
 * 负责什么：这是“设置界面”中的“设置、保存、主要流程、表单”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `readMainSettingsFromForm(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// ==================== Settings Save Main Form ====================
function readMainSettingsFromForm() {
    state.settings.apiEndpoint = readTrimmedControlValue(dom.apiEndpoint);
    state.settings.apiKey = readTrimmedControlValue(dom.apiKey);
    state.settings.saveApiKey = readCheckboxControlValue(dom.saveApiKey, false);
    state.settings.ollamaCompatMode = readCheckboxControlValue(dom.ollamaCompatMode, false);
    state.settings.model = readTrimmedControlValueOr(dom.modelName, 'gpt-4o');
    state.settings.contextLength = readIntegerControlValue(dom.contextLength, 20);
    state.settings.maxTokens = readIntegerControlValue(dom.maxTokens, 1024);
    state.settings.temperature = readFloatControlValue(dom.temperature, 0.7);
    state.settings.topP = readFloatControlValue(dom.topP, 0.9);
    state.settings.userName = readTrimmedControlValueOr(dom.userName, 'User');
    state.settings.systemPrompt = readTrimmedControlValue(dom.systemPrompt);
    if (dom.postHistoryInstructions) state.settings.postHistoryInstructions = readTrimmedControlValue(dom.postHistoryInstructions);
    if (dom.twoStageEnabled) state.settings.twoStageEnabled = readCheckboxControlValue(dom.twoStageEnabled, false);
    if (dom.twoStageTemperature) state.settings.twoStageTemperature = readFiniteFloatControlValue(dom.twoStageTemperature, 0.3);
    if (dom.twoStageTopP) state.settings.twoStageTopP = readFiniteFloatControlValue(dom.twoStageTopP, 0.85);
    if (dom.twoStageIncludeRecentContext) state.settings.twoStageIncludeRecentContext = readCheckboxControlValue(dom.twoStageIncludeRecentContext, false);
    if (dom.twoStageSystemPrompt) state.settings.twoStageSystemPrompt = readTrimmedControlValueOr(dom.twoStageSystemPrompt, DEFAULT_TWO_STAGE_PROMPT);
    if (dom.twoStagePostHistoryInstructions) state.settings.twoStagePostHistoryInstructions = readTrimmedControlValue(dom.twoStagePostHistoryInstructions);
    if (dom.requestCotEnabled) state.settings.requestCotEnabled = readCheckboxControlValue(dom.requestCotEnabled, false);
    if (dom.showCotEnabled) state.settings.showCotEnabled = readCheckboxControlValue(dom.showCotEnabled, false);
    if (dom.userDescription) state.settings.userDescription = readTrimmedControlValue(dom.userDescription);
}
