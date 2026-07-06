// ==================== Character and Data Event Bindings ====================
function bindCharacterAndDataEvents() {
    dom.charCreateBtn.addEventListener('click', openCharacterEditor);

    dom.charImportBtn.addEventListener('click', function() {
        dom.importModal.classList.remove('hidden');
        dom.importStatus.classList.add('hidden');
        dom.importFileInput.value = '';
    });

    dom.charEditBtn.addEventListener('click', openCharacterEditor);
    dom.charEditorCloseBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorBackdrop.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorCancelBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorSaveBtn.addEventListener('click', saveCharacterEdits);

    dom.exportAllBtn.addEventListener('click', exportAllConversations);

    dom.importConvBtn.addEventListener('click', function() { dom.convImportFile.click(); });
    dom.convImportFile.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) importConversations(file);
        dom.convImportFile.value = '';
    });

    dom.charRemoveBtn.addEventListener('click', removeCharacter);
    dom.charExportBtn.addEventListener('click', exportCharacter);
    dom.worldBookBtn.addEventListener('click', openWorldBookModal);
}
