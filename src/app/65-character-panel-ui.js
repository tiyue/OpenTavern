// ==================== Character Panel UI ====================
function renderCharacterCard() {
    var conv = getActiveConv();
    if (!conv) {
        renderCharacterPanelEmptyState();
        renderWorldInfoBadge();
        return;
    }

    if (isGroupChat(conv)) {
        renderGroupCharacterPanel(conv);
        renderWorldInfoBadge();
        return;
    }

    var character = conv.character;

    if (character) {
        renderSingleCharacterPanel(character);
    } else {
        renderCharacterPanelEmptyState();
    }
    renderWorldInfoBadge();
}
