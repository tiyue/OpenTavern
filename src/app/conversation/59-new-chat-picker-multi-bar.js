/**
 * 新手导读（文件：59-new-chat-picker-multi-bar.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、多选、工具栏”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `updateNewChatPickerMultiBar(isMultiSelect, selectedCount)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Multi Bar Helpers ====================
function updateNewChatPickerMultiBar(isMultiSelect, selectedCount) {
    if (!dom.newChatPickerMultiBar) return;
    if (isMultiSelect) {
        dom.newChatPickerMultiBar.classList.remove('hidden');
        if (dom.newChatPickerMultiCount) {
            var prefix = t('new_chat_multi_selected_prefix') || '已选';
            var suffix = t('new_chat_multi_people') || '人';
            dom.newChatPickerMultiCount.textContent = (prefix + ' ' + selectedCount + ' ' + suffix).trim();
        }
    } else {
        dom.newChatPickerMultiBar.classList.add('hidden');
    }
}
