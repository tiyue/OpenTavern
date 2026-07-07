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
