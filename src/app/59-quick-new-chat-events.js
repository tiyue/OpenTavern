// ==================== Quick New Chat Events ====================
function hideQuickNewChatModal(modal) {
    if (modal) modal.classList.add('hidden');
}

function startQuickNewChatWithCurrent(modal) {
    hideQuickNewChatModal(modal);
    const ch = getCurrentChatCharacter();
    newConversation(ch || null);
}

function returnQuickNewChatToLibrary(modal) {
    hideQuickNewChatModal(modal);
    currentCharacterName = null;
    if (typeof renderConversationList === 'function') renderConversationList();
    if (typeof switchView === 'function') switchView('library');
}

function openQuickNewChatGroupPicker(modal) {
    hideQuickNewChatModal(modal);
    newChatPickerCameFromQuick = true;
    showNewChatCharacterPicker();
}

function wireQuickNewChatModal(elements) {
    const modal = elements && elements.modal;
    if (!modal || modal._wiredQuick) return;
    modal._wiredQuick = true;

    if (elements.closeBtn) elements.closeBtn.addEventListener('click', () => hideQuickNewChatModal(modal));
    if (elements.backdrop) elements.backdrop.addEventListener('click', () => hideQuickNewChatModal(modal));
    if (elements.withCurrentBtn) elements.withCurrentBtn.addEventListener('click', () => startQuickNewChatWithCurrent(modal));
    if (elements.returnBtn) elements.returnBtn.addEventListener('click', () => returnQuickNewChatToLibrary(modal));
    if (elements.groupBtn) elements.groupBtn.addEventListener('click', () => openQuickNewChatGroupPicker(modal));
}
