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
function replacePlaceholders(text, charName, userName) {
    text = String(text || '');
    if (!text) return '';
    return text
        .replace(/\{\{char\}\}/gi, charName || '')
        .replace(/\{\{user\}\}/gi, userName || 'User');
}

function getEffectivePostHistoryInstructions(character, stage) {
    var settings = state && state.settings ? state.settings : {};
    var customPostHistory = stage === 'second'
        ? String(settings.twoStagePostHistoryInstructions || '').trim()
        : String(settings.postHistoryInstructions || '').trim();
    if (customPostHistory) return customPostHistory;
    return character ? String(character.post_history_instructions || '') : '';
}
