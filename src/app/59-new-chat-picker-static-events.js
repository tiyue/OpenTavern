// ==================== New Chat Picker Static Events ====================
function bindNewChatPickerStaticButtons(modal) {
    if (modal._wired) return;
    modal._wired = true;

    dom.newChatPickerCloseBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
    });

    dom.newChatPickerBackdrop.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
    });

    dom.newChatNoCharacterBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
        newConversation(null);
    });

    dom.newChatImportCharacterBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
        if (dom.importModal) {
            dom.importModal.classList.remove('hidden');
            dom.importStatus.classList.add('hidden');
            if (dom.importFileInput) dom.importFileInput.value = '';
        }
    });
}
