// ==================== New Chat First Message Helpers ====================
function appendCharacterFirstMessage(conv, character, options) {
    options = options || {};
    if (!conv || !character || !character.first_mes) return;
    var charName = character.name;
    var userName = state.settings.userName || 'User';
    var firstMes = replacePlaceholders(character.first_mes, charName, userName);
    if (!firstMes) return;

    var msg = { role: 'assistant', content: firstMes };
    if (options.speaker) msg.speaker = options.speaker;
    conv.messages.push(msg);
}
