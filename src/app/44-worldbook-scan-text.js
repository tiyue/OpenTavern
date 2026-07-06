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
