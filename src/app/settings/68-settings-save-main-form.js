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
function readMainSettingsFromForm(target) {
    var settings = target || (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings);
    settings.apiEndpoint = readTrimmedControlValue(dom.apiEndpoint);
    settings.apiKey = readTrimmedControlValue(dom.apiKey);
    settings.saveApiKey = readCheckboxControlValue(dom.saveApiKey, false);
    settings.model = readTrimmedControlValueOr(dom.modelName, 'gpt-4o');
    settings.contextLength = readIntegerControlValue(dom.contextLength, 20);
    settings.maxTokens = readIntegerControlValue(dom.maxTokens, 8192);
    settings.temperature = readFiniteFloatControlValue(dom.temperature, 0.7);
    if (dom.frequencyPenalty) settings.frequencyPenalty = readFiniteFloatControlValue(dom.frequencyPenalty, 0);
    if (dom.presencePenalty) settings.presencePenalty = readFiniteFloatControlValue(dom.presencePenalty, 0);
    settings.topP = readFiniteFloatControlValue(dom.topP, 0.9);
    settings.systemPrompt = readTrimmedControlValue(dom.systemPrompt);
    if (dom.postHistoryInstructions) settings.postHistoryInstructions = readTrimmedControlValue(dom.postHistoryInstructions);
    if (dom.twoStageEnabled) settings.twoStageEnabled = readCheckboxControlValue(dom.twoStageEnabled, false);
    if (dom.twoStageTemperature) settings.twoStageTemperature = readFiniteFloatControlValue(dom.twoStageTemperature, 0.3);
    if (dom.twoStageTopP) settings.twoStageTopP = readFiniteFloatControlValue(dom.twoStageTopP, 0.85);
    if (dom.twoStageIncludeRecentContext) settings.twoStageIncludeRecentContext = readCheckboxControlValue(dom.twoStageIncludeRecentContext, false);
    if (dom.twoStageSystemPrompt) settings.twoStageSystemPrompt = readTrimmedControlValueOr(dom.twoStageSystemPrompt, DEFAULT_TWO_STAGE_PROMPT);
    if (dom.twoStagePostHistoryInstructions) settings.twoStagePostHistoryInstructions = readTrimmedControlValue(dom.twoStagePostHistoryInstructions);
    if (dom.requestCotEnabled) settings.requestCotEnabled = readCheckboxControlValue(dom.requestCotEnabled, false);
    if (dom.showCotEnabled) settings.showCotEnabled = readCheckboxControlValue(dom.showCotEnabled, false);
    var personaValues = {
        name: readTrimmedControlValue(dom.userPersonaName),
        userName: readTrimmedControlValueOr(dom.userName, 'User'),
        description: readTrimmedControlValue(dom.userDescription)
    };
    if (settings !== state.settings) return;
    if (typeof updateActiveUserPersona === 'function') {
        updateActiveUserPersona(personaValues);
    } else {
        settings.userName = personaValues.userName;
        settings.userDescription = personaValues.description;
    }
}
