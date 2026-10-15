/**
 * 新手导读（文件：65-character-editor-ui.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“角色、编辑器、界面”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `openCharacterEditor(无参数)`、`saveCharacterEdits(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
// ==================== Character Editor UI ====================
function openCharacterEditor() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    hydrateCharacterEditorForm(c);
    dom.charEditorModal.classList.remove('hidden');
}

async function saveCharacterEdits() {
    var conv = getActiveConv();
    if (!conv) return;

    var candidate, character;
    try {
        candidate = JSON.parse(JSON.stringify(sanitizeCloudSyncSignatureConversation(conv)));
        var wasNew = !candidate.character || !candidate.character.name || candidate.character.name === 'Unnamed';
        character = buildCharacterFromEditorForm(candidate.character);
        candidate.character = character;
        if (shouldSeedEditedCharacterFirstMessage(candidate, character, wasNew)) appendCharacterFirstMessage(candidate, character);
        updateEditedCharacterConversationTitle(candidate, character, wasNew);
        normalizeConversation(candidate);
        if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(candidate);
        candidate.updated = Date.now();
        await persistPreparedConversation(candidate, { previous: conv, character: character });
    } catch (error) {
        alert('角色保存失败：' + (error.message || error));
        return false;
    }
    currentCharacterName = character.name;
    try {
        if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        dom.charEditorModal.classList.add('hidden');
        renderCharacterUI();
        renderMessagesOnly();
        renderConversationListOnly();
        appStore.notify('conversations');
    } catch (error) { reportPersistPostSaveError('character editor UI', error); }
    return true;
}
