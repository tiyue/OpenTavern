function showNewChatCharacterPicker() {
    const modal = dom.newChatPickerModal;
    const listContainer = dom.newChatPickerList;
    if (!modal || !listContainer) {
        newConversation();
        return;
    }

    // Consume the "came from quick menu" flag for this opening
    const cameFromQuick = !!newChatPickerCameFromQuick;
    newChatPickerCameFromQuick = false;

    resetNewChatPickerHeader(modal);

    listContainer.innerHTML = '';

    const session = createNewChatPickerSession(modal, listContainer, getAllAvailableCharacters());
    modal._newChatPickerSession = session;

    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
    ensureNewChatPickerMultiControls(modal);
    resetNewChatPickerMultiControls(session);

    // If the picker was opened by clicking "创建新群聊" in the quick action dialog,
    // automatically enter multi-select mode so user doesn't have to manually click the toggle.
    if (cameFromQuick) {
        setNewChatPickerMultiMode(session, true);
        // Note: we keep the local cameFromQuick for the header "← 返回" button
        // so user can still go back to the 3-option quick menu.
    }
    bindNewChatPickerStaticButtons(modal);
    updateNewChatPickerBackButton(modal, cameFromQuick);

    modal.classList.remove('hidden');
}
