/**
 * 新手导读（文件：59-quick-new-chat-helpers.js）
 *
 * 负责什么：这是“新建聊天流程”中的“快捷、新建、聊天、辅助函数”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `getCurrentChatCharacter(无参数)`、`getQuickNewChatElements(无参数)`、`updateQuickNewChatCurrentButtonLabel(button)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== Quick New Chat Helpers ====================
function getCurrentChatCharacter() {
    const conv = getActiveConv();
    if (conv) {
        if (conv.character) return conv.character;
        if (conv.group && Array.isArray(conv.group.members) && conv.group.members.length > 0) {
            var firstMember = conv.group.members[0];
            return firstMember && firstMember.character ? firstMember.character : null;
        }
    }
    if (currentCharacterName && state && state.characters) {
        const key = currentCharacterName.trim().toLowerCase();
        const found = Object.values(state.characters).find(c => (c.name || '').trim().toLowerCase() === key);
        if (found) return found;
    }
    return null;
}

function getQuickNewChatElements() {
    return {
        modal: document.getElementById('quickNewChatModal'),
        closeBtn: document.getElementById('quickNewChatCloseBtn'),
        backdrop: document.getElementById('quickNewChatBackdrop'),
        withCurrentBtn: document.getElementById('quickNewChatWithCurrentBtn'),
        returnBtn: document.getElementById('quickReturnToLibraryBtn'),
        groupBtn: document.getElementById('quickNewGroupChatBtn')
    };
}

function updateQuickNewChatCurrentButtonLabel(button) {
    if (!button) return;
    const currentChar = getCurrentChatCharacter();
    const base = t('quick_new_with_current') || '与当前角色开启新对话';
    button.innerHTML = currentChar && currentChar.name
        ? `${base}（${escapeHtml(currentChar.name)}）`
        : base;
}
