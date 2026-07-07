// ==================== Quick New Chat Action Modal (resolves library vs chat button conflict) ====================
function showQuickNewChatModal() {
    const elements = getQuickNewChatElements();
    if (!elements.modal) {
        showNewChatCharacterPicker();
        return;
    }

    updateQuickNewChatCurrentButtonLabel(elements.withCurrentBtn);
    wireQuickNewChatModal(elements);
    elements.modal.classList.remove('hidden');
}
