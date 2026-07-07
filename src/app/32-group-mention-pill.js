// ==================== Group Mention Pill ====================
function renderPendingGroupMentionPill(char) {
    if (!dom.mentionPill || !dom.mentionPillName) return;
    dom.mentionPill.classList.remove('hidden');
    dom.mentionPill.classList.add('flex');
    dom.mentionPillName.textContent = '@' + getGroupMentionDisplayName(char);
    dom.mentionPill.title = (char && char.name) || '';
}

function cleanGroupMentionInputText() {
    if (!dom.messageInput) return;
    dom.messageInput.value = (dom.messageInput.value || '').replace(/@[^\s@，,。.!?]+/g, '').trim();
}

function hidePendingGroupMentionPill() {
    if (!dom.mentionPill) return;
    dom.mentionPill.classList.remove('flex');
    dom.mentionPill.classList.add('hidden');
    if (dom.mentionPillName) {
        dom.mentionPillName.textContent = '';
        dom.mentionPill.title = '';
    }
}

