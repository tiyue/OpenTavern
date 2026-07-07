// ==================== Conversation Export / Import ====================
function exportConversation(id) {
    var conv = state.conversations[id];
    if (!conv) return;
    downloadJsonFile(
        buildSingleConversationExportData(conv, new Date().toISOString()),
        buildSingleConversationExportFilename(conv)
    );
}

function exportAllConversations() {
    var convs = getConversationExportRecords();
    if (convs.length === 0) { alert(t('nothing_to_archive')); return; }

    var exportedAt = new Date().toISOString();
    downloadJsonFile(
        buildAllConversationsExportData(convs, exportedAt),
        buildAllConversationsExportFilename(exportedAt)
    );
    recordBackupMade();
}

function downloadJsonFile(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importConversations(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);
            var convsToImport = getConversationImportRecords(data);
            if (!convsToImport) {
                alert(t('import_conv_error'));
                return;
            }

            if (convsToImport.length === 0) {
                alert(t('import_conv_error'));
                return;
            }

            var result = importConversationRecords(convsToImport);

            if (result.imported > 0) {
                applySuccessfulConversationImport(data, result);
            }

            alert(buildConversationImportSuccessMessage(result.imported, result.skipped));
        } catch(e) {
            console.error('[Import] failed:', e);
            alert(t('import_conv_error'));
        }
    };
    reader.readAsText(file);
}
