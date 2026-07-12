/**
 * 新手导读（文件：59-new-chat-picker-static-events.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、固定事件、事件”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `bindNewChatPickerStaticButtons(modal)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Static Events ====================
function bindNewChatPickerStaticButtons(modal) {
    if (modal._wired) return;
    modal._wired = true;

    dom.newChatPickerCloseBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
    });

    dom.newChatPickerBackdrop.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
    });

    dom.newChatNoCharacterBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
        newConversation(null);
    });

    dom.newChatImportCharacterBtn.addEventListener('click', function() {
        newChatPickerCameFromQuick = false;
        modal.classList.add('hidden');
        if (dom.importModal) {
            dom.importModal.classList.remove('hidden');
            dom.importStatus.classList.add('hidden');
            if (dom.importFileInput) dom.importFileInput.value = '';
        }
    });
}
