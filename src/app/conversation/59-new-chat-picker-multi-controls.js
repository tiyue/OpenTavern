/**
 * 新手导读（文件：59-new-chat-picker-multi-controls.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、多选、控件”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `ensureNewChatPickerMultiControls(modal)`、`resetNewChatPickerMultiControls(session)`、`setNewChatPickerMultiMode(session, enabled)`、`updateNewChatPickerMultiToggleText(toggleBtn, enabled)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Multi-select Controls ====================
function ensureNewChatPickerMultiControls(modal) {
    if (modal._multiControlsAdded) return;

    const bottomArea = modal.querySelector('.mt-4.pt-4.border-t');
    if (!bottomArea) return;
    modal._multiControlsAdded = true;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'w-full mb-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-all';
    updateNewChatPickerMultiToggleText(toggleBtn, false);
    toggleBtn.addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (!session) return;
        setNewChatPickerMultiMode(session, !session.multiSelectMode);
    });

    bottomArea.parentNode.insertBefore(toggleBtn, bottomArea);
    modal._multiToggleBtn = toggleBtn;
    modal._multiBottomArea = bottomArea;
}

function resetNewChatPickerMultiControls(session) {
    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, false);
    }
    syncNewChatPickerGroupConfirmBar(session);
}

function setNewChatPickerMultiMode(session, enabled) {
    session.multiSelectMode = !!enabled;
    session.selectedKeys.clear();

    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, session.multiSelectMode);
    }

    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
    syncNewChatPickerGroupConfirmBar(session);
}

function updateNewChatPickerMultiToggleText(toggleBtn, enabled) {
    const multiSelectText = t('new_chat_multi_select') || '多选创建群组聊天';
    const multiExitText = t('new_chat_multi_exit') || '退出多选模式';
    toggleBtn.textContent = enabled ? multiExitText : multiSelectText;
}
