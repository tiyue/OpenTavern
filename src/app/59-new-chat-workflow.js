// ==================== New Chat Workflow ====================
function newConversation(charOrChars) {
    saveCurrentConversation();
    var conv = defaultConversation();
    var current = getActiveConv();

    copyWorldInfoFromCurrentConversation(conv, current);

    if (!charOrChars || !Array.isArray(charOrChars)) {
        var character = charOrChars || (current && current.character ? current.character : null);
        configureSingleCharacterConversation(conv, character);
    } else if (Array.isArray(charOrChars) && charOrChars.length >= 2) {
        configureGroupConversation(conv, charOrChars);
    } else if (Array.isArray(charOrChars) && charOrChars.length === 1) {
        configureSingleCharacterConversation(conv, charOrChars[0]);
    }

    normalizeConversation(conv);
    registerNewConversation(conv);
    renderNewConversationState(conv);
    finalizeNewConversationUi();
}

// Phase 4: Show character picker when creating new chat
// Stage 1 MVP: supports multi-select group chat creation.
