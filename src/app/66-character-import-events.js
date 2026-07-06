// ==================== Character Import Modal Events ====================
function bindCharacterImportModalEvents() {
    dom.importCloseBtn.addEventListener('click', function() { hideCharacterImportModal(); });
    dom.importBackdrop.addEventListener('click', function() { hideCharacterImportModal(); });

    dom.importFileInput.addEventListener('change', async function(e) {
        var file = e.target.files[0];
        if (!file) return;

        setCharacterImportStatus('Reading...', 'neutral');

        try {
            var imported = await readCharacterImportFile(file);
            var character = importCharacterCard(imported.json);
            if (imported.attachedPreview) {
                character.previewImage = imported.attachedPreview;
            }

            var conv = prepareConversationForImportedCharacter();
            applyImportedCharacterToConversation(conv, character);
            var embeddedBook = attachEmbeddedCharacterBook(imported.json, character, conv);
            registerImportedCharacter(character);
            addImportedCharacterFirstMessage(conv, character);

            conv.updated = Date.now();
            persistState();
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
            renderAll();
            hideCharacterImportModal();
            setCharacterImportStatus(buildCharacterImportSuccessText(character, embeddedBook), 'success');
            setTimeout(function() { dom.importStatus.classList.add('hidden'); }, 2800);
        } catch (err) {
            setCharacterImportStatus(t('import_error') + ': ' + (err.message || err), 'error');
        } finally {
            resetCharacterImportFileInput();
        }
    });
}
