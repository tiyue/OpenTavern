// ==================== Quick New Chat Helpers ====================
function getCurrentChatCharacter() {
    const conv = getActiveConv();
    if (conv) {
        if (conv.character) return conv.character;
        if (conv.group && Array.isArray(conv.group.members) && conv.group.members.length > 0) {
            var firstMember = conv.group.members[0];
            return firstMember && firstMember.character ? firstMember.character : null;
        }
    }
    if (currentCharacterName && state && state.characters) {
        const key = currentCharacterName.trim().toLowerCase();
        const found = Object.values(state.characters).find(c => (c.name || '').trim().toLowerCase() === key);
        if (found) return found;
    }
    return null;
}

function getQuickNewChatElements() {
    return {
        modal: document.getElementById('quickNewChatModal'),
        closeBtn: document.getElementById('quickNewChatCloseBtn'),
        backdrop: document.getElementById('quickNewChatBackdrop'),
        withCurrentBtn: document.getElementById('quickNewChatWithCurrentBtn'),
        returnBtn: document.getElementById('quickReturnToLibraryBtn'),
        groupBtn: document.getElementById('quickNewGroupChatBtn')
    };
}

function updateQuickNewChatCurrentButtonLabel(button) {
    if (!button) return;
    const currentChar = getCurrentChatCharacter();
    const base = t('quick_new_with_current') || '与当前角色开启新对话';
    button.innerHTML = currentChar && currentChar.name
        ? `${base}（${escapeHtml(currentChar.name)}）`
        : base;
}
