// ==================== New Chat Picker Multi-select Controls ====================
function ensureNewChatPickerMultiControls(modal) {
    if (modal._multiControlsAdded) return;

    const bottomArea = modal.querySelector('.mt-4.pt-4.border-t');
    if (!bottomArea) return;
    modal._multiControlsAdded = true;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'w-full mb-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-all';
    updateNewChatPickerMultiToggleText(toggleBtn, false);
    toggleBtn.addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (!session) return;
        setNewChatPickerMultiMode(session, !session.multiSelectMode);
    });

    bottomArea.parentNode.insertBefore(toggleBtn, bottomArea);
    modal._multiToggleBtn = toggleBtn;
    modal._multiBottomArea = bottomArea;
}

function resetNewChatPickerMultiControls(session) {
    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, false);
    }
    syncNewChatPickerGroupConfirmBar(session);
}

function setNewChatPickerMultiMode(session, enabled) {
    session.multiSelectMode = !!enabled;
    session.selectedKeys.clear();

    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, session.multiSelectMode);
    }

    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
    syncNewChatPickerGroupConfirmBar(session);
}

function updateNewChatPickerMultiToggleText(toggleBtn, enabled) {
    const multiSelectText = t('new_chat_multi_select') || '多选创建群组聊天';
    const multiExitText = t('new_chat_multi_exit') || '退出多选模式';
    toggleBtn.textContent = enabled ? multiExitText : multiSelectText;
}
