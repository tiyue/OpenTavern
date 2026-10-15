/**
 * 新手导读（文件：41-prompt-builder.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、构建器”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `buildSystemPrompt(character, worldInfoByPos)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// ==================== Prompt Builder ====================
function buildSystemPrompt(character, worldInfoByPos) {
    var parts = [];
    var charName = character ? character.name : 'Assistant';
    var userName = state.settings.userName || 'User';

    var sysPrompt = state.settings.systemPrompt;
    if (!sysPrompt && character && character.system_prompt) {
        sysPrompt = character.system_prompt;
    }
    if (sysPrompt) {
        parts.push(replacePlaceholders(sysPrompt, charName, userName));
    }

    // Inject user description / persona (user's own setting)
    var userDesc = state.settings.userDescription || '';
    if (userDesc && userDesc.trim()) {
        parts.push('User\'s Persona: ' + replacePlaceholders(userDesc.trim(), charName, userName));
    }

    var postHistory = getEffectivePostHistoryInstructions(character);
    if (postHistory) {
        parts.push(replacePlaceholders(postHistory, charName, userName));
    }

    if (character) {
        var charInfo = [];
        if (character.personality) charInfo.push('Personality: ' + replacePlaceholders(character.personality, charName, userName));
        if (character.scenario) charInfo.push('Scenario: ' + replacePlaceholders(character.scenario, charName, userName));
        if (character.description) charInfo.push(replacePlaceholders(character.description, charName, userName));
        if (charInfo.length > 0) parts.push(charInfo.join('\n\n'));
    }

    // World Info injection (before/after char + example/AN positions)
    if (worldInfoByPos) {
        parts = injectWorldInfoIntoSystem(parts, worldInfoByPos, charName, userName);
    }

    if (character && character.mes_example) {
        parts.push('Example dialogues:\n' + replacePlaceholders(character.mes_example, charName, userName));
    }

    return parts.join('\n\n').trim();
}
