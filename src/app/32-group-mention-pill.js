/**
 * 新手导读（文件：32-group-mention-pill.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、点名、提示标签”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `renderPendingGroupMentionPill(char)`、`cleanGroupMentionInputText(无参数)`、`hidePendingGroupMentionPill(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
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

