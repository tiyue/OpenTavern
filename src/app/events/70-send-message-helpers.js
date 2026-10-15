/**
 * 新手导读（文件：70-send-message-helpers.js）
 *
 * 负责什么：这是“全局事件初始化”中的“发送、消息、辅助函数”部分。
 * 在程序中的位置：它集中启动页面事件绑定，并提供发送消息所需的输入辅助。
 * 从哪里开始看：主要从 `appendUserMessageToConversation(conv, text)`、`getMentionedGroupSpeakerForMessage(text, conv)`、`prepareGroupSpeakerForUserMessage(conv, text)`、`resetMessageComposerInput(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化只能执行一次，否则一个点击会触发多次相同操作。
 */
// ==================== Send Message Helpers ====================
function appendUserMessageToConversation(conv, text) {
    conv.messages.push({ role: 'user', content: text, id: makeId() });
    normalizeConversationMessageIdentity(conv);
    conv.updated = Date.now();
    conv._wiBudgetWarning = false;
    if (conv.title === t('title_new_chat_match')) {
        conv.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
    }
}

function getMentionedGroupSpeakerForMessage(text, conv) {
    if (pendingGroupMention) {
        var mentioned = pendingGroupMention;
        clearPendingGroupMention();
        return mentioned;
    }
    return parseGroupMention(text, conv);
}

function prepareGroupSpeakerForUserMessage(conv, text) {
    if (!isGroupChat(conv)) return;

    var mentioned = getMentionedGroupSpeakerForMessage(text, conv);
    conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
}

function resetMessageComposerInput() {
    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    clearPendingGroupMention();
}
