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
