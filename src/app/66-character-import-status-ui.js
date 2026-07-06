// ==================== Character Import Status UI ====================
function hideCharacterImportModal() {
    dom.importModal.classList.add('hidden');
}

function resetCharacterImportFileInput() {
    if (dom.importFileInput) dom.importFileInput.value = '';
}

function setCharacterImportStatus(text, type) {
    dom.importStatus.classList.remove('hidden');
    dom.importStatus.textContent = text;
    if (type === 'success') {
        dom.importStatus.className = 'text-xs text-emerald-400 mt-3 text-center';
    } else if (type === 'error') {
        dom.importStatus.className = 'text-xs text-red-400 mt-3 text-center';
    }
}

function buildCharacterImportSuccessText(character, embeddedBook) {
    var successText = t('import_success') + character.name;
    if (embeddedBook) {
        var entryCount = Object.keys(embeddedBook.entries || {}).length;
        successText += ' (embedded world book linked: ' + entryCount + ' entries)';
    }
    return successText;
}
