/**
 * 新手导读（文件：66-character-import-events.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“角色、导入、事件”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `bindCharacterImportModalEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
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
            if (typeof requestCharacterRegexConsent === 'function') {
                await requestCharacterRegexConsent(character);
            }
            if (imported.attachedPreview) {
                character.previewImage = imported.attachedPreview;
            }

            var conv = prepareConversationForImportedCharacter();
            var previous = Object.prototype.hasOwnProperty.call(state.conversations, conv.id) ? state.conversations[conv.id] : null;
            applyImportedCharacterToConversation(conv, character);
            var embeddedBook = attachEmbeddedCharacterBook(imported.json, character, conv);
            addImportedCharacterFirstMessage(conv, character);
            normalizeConversation(conv);
            if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(conv);
            conv.updated = Date.now();
            await persistPreparedConversation(conv, { previous: previous, character: character, worldBook: embeddedBook });
            currentCharacterName = character.name;
            try {
                if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
                renderAll();
                hideCharacterImportModal();
                setCharacterImportStatus(buildCharacterImportSuccessText(character, embeddedBook), 'success');
                setTimeout(function() { dom.importStatus.classList.add('hidden'); }, 2800);
            } catch (error) { reportPersistPostSaveError('character import UI', error); }
        } catch (err) {
            setCharacterImportStatus(t('import_error') + ': ' + (err.message || err), 'error');
        } finally {
            resetCharacterImportFileInput();
        }
    });
}
