/**
 * 新手导读（文件：59-quick-new-chat-events.js）
 *
 * 负责什么：这是“新建聊天流程”中的“快捷、新建、聊天、事件”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `hideQuickNewChatModal(modal)`、`startQuickNewChatWithCurrent(modal)`、`returnQuickNewChatToLibrary(modal)`、`openQuickNewChatGroupPicker(modal)`、`wireQuickNewChatModal(elements)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== Quick New Chat Events ====================
function hideQuickNewChatModal(modal) {
    if (modal) modal.classList.add('hidden');
}

function startQuickNewChatWithCurrent(modal) {
    hideQuickNewChatModal(modal);
    const ch = getCurrentChatCharacter();
    newConversation(ch || null);
}

function returnQuickNewChatToLibrary(modal) {
    hideQuickNewChatModal(modal);
    currentCharacterName = null;
    if (typeof renderConversationList === 'function') renderConversationList();
    if (typeof switchView === 'function') switchView('library');
}

function openQuickNewChatGroupPicker(modal) {
    hideQuickNewChatModal(modal);
    newChatPickerCameFromQuick = true;
    showNewChatCharacterPicker();
}

function wireQuickNewChatModal(elements) {
    const modal = elements && elements.modal;
    if (!modal || modal._wiredQuick) return;
    modal._wiredQuick = true;

    if (elements.closeBtn) elements.closeBtn.addEventListener('click', () => hideQuickNewChatModal(modal));
    if (elements.backdrop) elements.backdrop.addEventListener('click', () => hideQuickNewChatModal(modal));
    if (elements.withCurrentBtn) elements.withCurrentBtn.addEventListener('click', () => startQuickNewChatWithCurrent(modal));
    if (elements.returnBtn) elements.returnBtn.addEventListener('click', () => returnQuickNewChatToLibrary(modal));
    if (elements.groupBtn) elements.groupBtn.addEventListener('click', () => openQuickNewChatGroupPicker(modal));
}
