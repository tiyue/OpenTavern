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
