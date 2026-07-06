// ==================== Conversation Export / Import ====================
function exportConversation(id) {
    var conv = state.conversations[id];
    if (!conv) return;
    downloadJsonFile(
        { version: 1, type: 'opentavern-export', exported_at: new Date().toISOString(), conversations: [conv] },
        (conv.title || 'conversation').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '.json'
    );
}

function exportAllConversations() {
    var convs = state.conversationOrder.map(function(id) { return state.conversations[id]; }).filter(Boolean);
    if (convs.length === 0) { alert(t('nothing_to_archive')); return; }

    // 【Export Fix】导出完整备份：包含全局角色卡库、WorldBook、对话等
    // 旧格式仍兼容（只导 conversations），新格式带完整数据
    var exportData = {
        version: 2,
        type: 'opentavern-full-export',
        exported_at: new Date().toISOString(),
        settings: getSafeSettingsForPersist(),
        conversations: convs,
        conversationOrder: state.conversationOrder || [],
        characters: state.characters || {},          // 全局卡片库
        worldBooks: state.worldBooks || {},
        charactersMigrated: !!state._charactersMigrated
    };

    downloadJsonFile(
        exportData,
        'opentavern_all_' + new Date().toISOString().slice(0, 10) + '.json'
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
