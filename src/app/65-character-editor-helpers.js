/**
 * 新手导读（文件：65-character-editor-helpers.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“角色、编辑器、辅助函数”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `hydrateCharacterEditorForm(character)`、`parseCharacterEditorTags(tagsRaw)`、`buildCharacterFromEditorForm(previousCharacter)`、`registerEditedCharacter(character)`、`shouldSeedEditedCharacterFirstMessage(conv, character, wasNew)`、`updateEditedCharacterConversationTitle(conv, character, wasNew)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
// ==================== Character Editor Helpers ====================
function hydrateCharacterEditorForm(character) {
    dom.charEditName.value = character ? character.name : '';
    dom.charEditTags.value = character && character.tags ? character.tags.join(', ') : '';
    dom.charEditDescription.value = character ? character.description : '';
    dom.charEditPersonality.value = character ? character.personality : '';
    dom.charEditScenario.value = character ? character.scenario : '';
    dom.charEditFirstMes.value = character ? character.first_mes : '';
    dom.charEditMesExample.value = character ? character.mes_example : '';
    dom.charEditSystemPrompt.value = character ? character.system_prompt : '';
    dom.charEditPostHistory.value = character ? character.post_history_instructions : '';
    dom.charEditCreatorNotes.value = character ? character.creator_notes : '';
}

function parseCharacterEditorTags(tagsRaw) {
    tagsRaw = String(tagsRaw || '').trim();
    return tagsRaw ? tagsRaw.split(',').map(function(tag) { return tag.trim(); }).filter(Boolean) : [];
}

function buildCharacterFromEditorForm(previousCharacter) {
    return {
        name: dom.charEditName.value.trim() || 'Unnamed',
        description: dom.charEditDescription.value,
        personality: dom.charEditPersonality.value,
        scenario: dom.charEditScenario.value,
        first_mes: dom.charEditFirstMes.value,
        mes_example: dom.charEditMesExample.value,
        system_prompt: dom.charEditSystemPrompt.value,
        post_history_instructions: dom.charEditPostHistory.value,
        creator_notes: dom.charEditCreatorNotes.value,
        tags: parseCharacterEditorTags(dom.charEditTags.value),
        alternate_greetings: previousCharacter ? (previousCharacter.alternate_greetings || []) : [],
        extensions: previousCharacter ? (previousCharacter.extensions || {}) : {}
    };
}

function registerEditedCharacter(character) {
    if (!character.name) return;
    var key = character.name.trim().toLowerCase();
    if (!state.characters) state.characters = {};
    state.characters[key] = JSON.parse(JSON.stringify(character));
}

function shouldSeedEditedCharacterFirstMessage(conv, character, wasNew) {
    return !!(wasNew && character.first_mes && conv.messages.length === 0);
}

function updateEditedCharacterConversationTitle(conv, character, wasNew) {
    if (conv.title === t('title_new_chat_match') || conv.title === t('new_chat_title') || (wasNew && conv.title.indexOf(t('chat_with')) === 0)) {
        conv.title = t('chat_with') + character.name;
    }
}
