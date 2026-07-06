// ==================== Character Editor UI ====================
function openCharacterEditor() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    dom.charEditName.value = c ? c.name : '';
    dom.charEditTags.value = c && c.tags ? c.tags.join(', ') : '';
    dom.charEditDescription.value = c ? c.description : '';
    dom.charEditPersonality.value = c ? c.personality : '';
    dom.charEditScenario.value = c ? c.scenario : '';
    dom.charEditFirstMes.value = c ? c.first_mes : '';
    dom.charEditMesExample.value = c ? c.mes_example : '';
    dom.charEditSystemPrompt.value = c ? c.system_prompt : '';
    dom.charEditPostHistory.value = c ? c.post_history_instructions : '';
    dom.charEditCreatorNotes.value = c ? c.creator_notes : '';
    dom.charEditorModal.classList.remove('hidden');
}

function saveCharacterEdits() {
    var conv = getActiveConv();
    if (!conv) return;

    var tagsRaw = dom.charEditTags.value.trim();
    var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

    var character = {
        name: dom.charEditName.value.trim() || 'Unnamed',
        description: dom.charEditDescription.value,
        personality: dom.charEditPersonality.value,
        scenario: dom.charEditScenario.value,
        first_mes: dom.charEditFirstMes.value,
        mes_example: dom.charEditMesExample.value,
        system_prompt: dom.charEditSystemPrompt.value,
        post_history_instructions: dom.charEditPostHistory.value,
        creator_notes: dom.charEditCreatorNotes.value,
        tags: tags,
        alternate_greetings: conv.character ? (conv.character.alternate_greetings || []) : [],
        extensions: conv.character ? (conv.character.extensions || {}) : {}
    };

    var wasNew = !conv.character || !conv.character.name || conv.character.name === 'Unnamed';
    conv.character = character;

    if (character.name) {
        const key = character.name.trim().toLowerCase();
        if (!state.characters) state.characters = {};
        state.characters[key] = JSON.parse(JSON.stringify(character));
    }

    if (wasNew && character.first_mes && conv.messages.length === 0) {
        var charName = character.name;
        var userName = state.settings.userName || 'User';
        var firstMes = replacePlaceholders(character.first_mes, charName, userName);
        if (firstMes) conv.messages.push({ role: 'assistant', content: firstMes });
    }

    if (conv.title === t('title_new_chat_match') || conv.title === t('new_chat_title') || (wasNew && conv.title.indexOf(t('chat_with')) === 0)) {
        conv.title = t('chat_with') + character.name;
    }
    conv.updated = Date.now();
    persistState();

    if (typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }

    dom.charEditorModal.classList.add('hidden');

    renderCharacterUI();
    renderMessagesOnly();
    renderConversationListOnly();
    appStore.notify('conversations');
}
