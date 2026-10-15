/**
 * 新手导读（文件：59-new-chat-picker-ui.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、界面”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `showNewChatCharacterPicker(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// 新建聊天角色选择器：打开角色列表并协调单聊、群聊选择流程。
function showNewChatCharacterPicker() {
    const modal = dom.newChatPickerModal;
    const listContainer = dom.newChatPickerList;
    if (!modal || !listContainer) {
        newConversation();
        return;
    }

    // Consume the "came from quick menu" flag for this opening
    const cameFromQuick = !!newChatPickerCameFromQuick;
    newChatPickerCameFromQuick = false;

    resetNewChatPickerHeader(modal);

    listContainer.innerHTML = '';

    const session = createNewChatPickerSession(modal, listContainer, getAllAvailableCharacters());
    modal._newChatPickerSession = session;

    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
    ensureNewChatPickerMultiControls(modal);
    resetNewChatPickerMultiControls(session);

    // If the picker was opened by clicking "创建新群聊" in the quick action dialog,
    // automatically enter multi-select mode so user doesn't have to manually click the toggle.
    if (cameFromQuick) {
        setNewChatPickerMultiMode(session, true);
        // Note: we keep the local cameFromQuick for the header "← 返回" button
        // so user can still go back to the 3-option quick menu.
    }
    bindNewChatPickerStaticButtons(modal);
    updateNewChatPickerBackButton(modal, cameFromQuick);

    modal.classList.remove('hidden');
}
