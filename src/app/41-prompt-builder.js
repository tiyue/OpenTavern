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
