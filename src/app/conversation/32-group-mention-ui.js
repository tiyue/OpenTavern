/**
 * 新手导读（文件：32-group-mention-ui.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、点名、界面”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `showGroupMentionPanel(conv)`、`setPendingGroupMention(char)`、`clearPendingGroupMention(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
// ==================== Group Mention UI Helpers ====================
function showGroupMentionPanel(conv) {
    const modal = dom.groupMentionModal;
    const listContainer = dom.groupMentionList;
    if (!modal || !listContainer || !conv) return;

    listContainer.innerHTML = '';

    const members = getGroupMembers(conv);
    if (members.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-zinc-400 text-center py-6">当前群组没有成员</p>';
        modal.classList.remove('hidden');
        return;
    }

    members.forEach(member => {
        const item = createGroupMentionMemberElement(member, function(char) {
            setPendingGroupMention(char);
            modal.classList.add('hidden');
            if (dom.messageInput) dom.messageInput.focus();
        });
        listContainer.appendChild(item);
    });

    // 绑定关闭
    const close = () => modal.classList.add('hidden');
    dom.groupMentionCloseBtn.onclick = close;
    dom.groupMentionBackdrop.onclick = close;

    modal.classList.remove('hidden');
}

// ===== 新 @ 指定 UI 辅助：气泡而非文本插入（只能指定一个角色） =====
function setPendingGroupMention(char) {
    if (!char) return;
    pendingGroupMention = char;
    renderPendingGroupMentionPill(char);
    cleanGroupMentionInputText();
}

function clearPendingGroupMention() {
    pendingGroupMention = null;
    hidePendingGroupMentionPill();
}
