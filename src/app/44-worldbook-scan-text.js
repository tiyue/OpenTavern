/**
 * 新手导读（文件：44-worldbook-scan-text.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、扫描、文本”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `appendWorldBookCharacterScanSources(out, character, entry)`、`buildScanText(conv, depth, entry)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Scan Text ====================
function appendWorldBookCharacterScanSources(out, character, entry) {
    if (!character) return;
    if (entry) {
        if (entry.matchCharacterDescription) out.push('CharacterDescription: ' + (character.description || ''));
        if (entry.matchCharacterPersonality) out.push('CharacterPersonality: ' + (character.personality || ''));
        if (entry.matchScenario) out.push('Scenario: ' + (character.scenario || ''));
        if (entry.matchCharacterDepthPrompt) out.push("Character's Note: " + getEffectivePostHistoryInstructions(character));
        if (entry.matchCreatorNotes) out.push('Creator Notes: ' + (character.creator_notes || ''));
        return;
    }

    out.push('CharacterDescription: ' + (character.description || ''));
    out.push('CharacterPersonality: ' + (character.personality || ''));
    out.push('Scenario: ' + (character.scenario || ''));
}

function buildScanText(conv, depth, entry) {
    if (!conv) return '';
    var msgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    depth = depth || 4;
    if (depth > 0) msgs = msgs.slice(-depth);
    var charName = conv.character ? conv.character.name : '';
    var userName = state.settings.userName || 'User';
    var out = [];

    for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        var prefix = m.role === 'user' ? (userName + ': ') : (charName ? (charName + ': ') : '');
        out.push(prefix + (m.content || ''));
    }

    appendWorldBookCharacterScanSources(out, conv.character, entry);
    return out.join('\n');
}
