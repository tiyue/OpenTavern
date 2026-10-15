/**
 * 新手导读（文件：40-character-prompt-helpers.js）
 *
 * 负责什么：这是“角色卡导入”中的“角色、提示词、辅助函数”部分。
 * 在程序中的位置：它解析 PNG 或 JSON 角色卡，把角色设定和角色世界书转换成内部格式。
 * 从哪里开始看：主要从 `replacePlaceholders(text, charName, userName)`、`getEffectivePostHistoryInstructions(character, stage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：外部文件不可信；读取字段时要允许缺失值并避免直接执行其中的内容。
 */
// ==================== Character Prompt Helpers ====================
function getSillyTavernPresetPromptContentFromSettings(settings, identifier) {
    var preset = settings && settings.sillyTavernPreset;
    var prompts = preset && Array.isArray(preset.prompts) ? preset.prompts : [];
    var wanted = String(identifier || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    for (var i = 0; i < prompts.length; i++) {
        var prompt = prompts[i] || {};
        var id = String(prompt.identifier || prompt.id || prompt.name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (id === wanted) return String(prompt.content || '');
    }
    return '';
}

function replacePlaceholders(text, charName, userName, extras) {
    text = String(text || '');
    if (!text) return '';
    extras = extras || {};
    var settings = extras.settings || (typeof state !== 'undefined' && state && state.settings ? state.settings : {});
    var persona = extras.persona == null ? (settings.userDescription || '') : String(extras.persona);
    var original = extras.original == null ? '' : String(extras.original);
    var charPrompt = extras.charPrompt == null
        ? getSillyTavernPresetPromptContentFromSettings(settings, 'main')
        : String(extras.charPrompt);
    var charJailbreak = extras.charJailbreak == null
        ? getSillyTavernPresetPromptContentFromSettings(settings, 'jailbreak')
        : String(extras.charJailbreak);

    var hasMvuSnapshot = Object.prototype.hasOwnProperty.call(extras, 'mvuData');
    var macroEnv = extras.macroEnv || (typeof _activeSillyTavernMacroEnv !== 'undefined' ? _activeSillyTavernMacroEnv : null);
    if (!extras.skipStMacros && typeof evaluateSillyTavernMacros === 'function' && text.includes('{{')) {
        var activeEnv = typeof _activeSillyTavernMacroEnv !== 'undefined' ? _activeSillyTavernMacroEnv : null;
        var baseMacroEnv = macroEnv || createSillyTavernMacroEnv(extras.conv, {
            charName: charName,
            userName: userName,
            persona: persona,
            original: original,
            historyMessages: extras.historyMessages,
            persist: false
        });
        macroEnv = hasMvuSnapshot && extras.mvuData !== baseMacroEnv.mvuData ? Object.create(baseMacroEnv) : baseMacroEnv;
        if (hasMvuSnapshot) macroEnv.mvuData = extras.mvuData;
        if (extras.message != null) macroEnv.message = extras.message;
        macroEnv.charName = charName || macroEnv.charName;
        macroEnv.userName = userName || macroEnv.userName;
        macroEnv.persona = persona;
        macroEnv.original = original;
        var allowMutations = extras.allowStVarMutations === true ||
            (baseMacroEnv === activeEnv && typeof _activeSillyTavernMacroMutations !== 'undefined' && _activeSillyTavernMacroMutations);
        text = evaluateSillyTavernMacros(text, macroEnv, { mutate: allowMutations });
    }

    var replaced = text
        .replace(/\{\{\s*original\s*\}\}/gi, original)
        .replace(/\{\{\s*persona\s*\}\}/gi, persona)
        .replace(/\{\{\s*newline\s*\}\}/gi, '\n')
        .replace(/\{\{\s*(?:noop|trim)\s*\}\}/gi, '')
        .replace(/\{\{\s*charPrompt\s*\}\}/gi, charPrompt)
        .replace(/\{\{\s*(?:charJailbreak|charInstruction)\s*\}\}/gi, charJailbreak)
        .replace(/\{\{char\}\}/gi, charName || '')
        .replace(/\{\{user\}\}/gi, userName || 'User');
    if (typeof renderDeclarativeTemplateSubset === 'function') {
        var env = macroEnv;
        var conv = extras.conv || (env && env.conv);
        if (conv) {
            var data = hasMvuSnapshot ? extras.mvuData : (env && env.mvuData) || getMvuDataForMessage(conv, extras.message || null);
            replaced = renderDeclarativeTemplateSubset(replaced, data, { worldInfo: getMvuWorldInfoEntries(conv) }).output;
        }
    }
    return replaced;
}

function getEffectivePostHistoryInstructions(character, stage) {
    var settings = typeof state !== 'undefined' && state && state.settings ? state.settings : {};
    var customPostHistory = stage === 'second'
        ? String(settings.twoStagePostHistoryInstructions || '').trim()
        : String(settings.postHistoryInstructions || '').trim();
    if (customPostHistory) return customPostHistory;
    return character ? String(character.post_history_instructions || '') : '';
}
