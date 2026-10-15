/**
 * 新手导读（文件：66-character-import-status-ui.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“角色、导入、状态、界面”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `hideCharacterImportModal(无参数)`、`resetCharacterImportFileInput(无参数)`、`setCharacterImportStatus(text, type)`、`buildCharacterImportSuccessText(character, embeddedBook)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
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
