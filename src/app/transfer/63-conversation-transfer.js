/**
 * 新手导读（文件：63-conversation-transfer.js）
 *
 * 负责什么：这是“会话导入导出”中的“会话、转移”部分。
 * 在程序中的位置：它把聊天记录转换成文件，或把外部记录合并为内部会话。
 * 从哪里开始看：主要从 `exportConversation(id)`、`exportAllConversations(无参数)`、`downloadJsonFile(data, filename)`、`importConversations(file)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：导入内容可能不完整或重复，必须先规范化再写入现有状态。
 */
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
            openBackupRestorePreview(data);
        } catch(e) {
            console.error('[Import] failed:', e);
            alert(t('import_conv_error') + ' ' + (e.message || ''));
        }
    };
    reader.onerror = function() { alert(t('import_conv_error')); };
    reader.readAsText(file);
}
