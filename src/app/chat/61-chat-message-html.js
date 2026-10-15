/**
 * 新手导读（文件：61-chat-message-html.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、网页内容”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderMessageActionButtons(actualIdx, isUser)`、`renderChatMessageHtml(msg, conv)`、`renderChatMessagesHtml(messages, conv)`、`createChatMessageElement(msg, conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Message HTML Helpers ====================
function isImageAttachmentOnlyMessage(msg) {
    if (!msg || String(msg.content || '').trim()) return false;
    return Array.isArray(msg.attachments) && msg.attachments.some(function(attachment) {
        return attachment && attachment.type === 'image';
    });
}

function getMessageFavoriteState(msg, conv) {
    return !!(conv && conv.favoriteMessageIds && conv.favoriteMessageIds.indexOf(msg && msg.id) >= 0);
}

function renderMessageActionButtons(actualIdx, isUser, msg) {
    var html = '';
    var imageOnly = isImageAttachmentOnlyMessage(msg);
    if (!imageOnly) {
        html += '<button class="msg-action-btn copy-btn" data-action="copy" data-msg-idx="' + actualIdx + '" title="' + t('copy') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
        html += '<button class="msg-action-btn edit-btn" data-action="edit" data-msg-idx="' + actualIdx + '" title="' + t('edit_msg') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    }
    if (!isUser && !imageOnly) {
        html += '<button class="msg-action-btn retry-btn" data-action="retry" data-msg-idx="' + actualIdx + '" title="' + t('regenerate') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>';
    }
    if (!isUser && msg.stage !== 'second') html += renderResponseVersionControls(msg, actualIdx);
    var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
    if (typeof canContinueMessage === 'function' && canContinueMessage(conv, msg)) html += '<button class="msg-action-btn" data-action="continue" data-msg-idx="' + actualIdx + '">续写</button>';
    if (conv && typeof normalizeConversationFavorites === 'function') {
        var favorited = getMessageFavoriteState(msg, conv);
        html += '<button class="msg-action-btn" data-action="favorite" data-msg-idx="' + actualIdx + '" aria-pressed="' + (favorited ? 'true' : 'false') + '">' + (favorited ? '取消收藏' : '收藏') + '</button>';
    }
    if (conv && actualIdx === conv.messages.findIndex(function(message) { return message.role !== 'system'; }) && !isUser && typeof getCharacterGreetings === 'function') html += '<button class="msg-action-btn" data-action="greeting" data-msg-idx="' + actualIdx + '">开场</button>';
    html += '<button class="msg-action-btn del-btn" data-action="delete" data-msg-idx="' + actualIdx + '" title="' + t('delete_msg') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
    return html;
}

function renderChatMessageHtml(msg, conv) {
    var isUser = msg.role === 'user';
    var senderName = getMessageSenderName(msg, conv);
    var actualIdx = conv.messages.indexOf(msg);
    var html = '';

    html += '<div data-message-id="' + escapeHtml(msg.id) + '" class="msg-enter ' + (isUser ? 'msg-user flex justify-end' : 'msg-assistant flex justify-start') + '">';
    html += '<div class="max-w-[80%] msg-wrapper">';
    var messageCharacter = !isUser ? getMessageSpeakerCharacter(msg, conv) : null;
    if (!isUser) html += renderAssistantSenderHtml(senderName, messageCharacter);
    var renderContext = { conv: conv, msg: msg, character: messageCharacter };
    if (!isUser) html += renderCotBlock(msg.cot, false, renderContext);
    html += '<div class="msg-bubble">' + renderMessageBubbleContent(msg, isUser, renderContext) + '</div>';
    if (!isUser) html += renderMsgTokenMeta(msg);
    html += '<div class="msg-actions">' + renderMessageActionButtons(actualIdx, isUser, msg) + '</div>';
    html += '</div></div>';

    return html;
}

function renderChatMessagesHtml(messages, conv) {
    var html = '';
    for (var i = 0; i < messages.length; i++) {
        html += renderChatMessageHtml(messages[i], conv);
    }
    return html;
}

function createChatMessageElement(msg, conv) {
    var holder = document.createElement('div');
    holder.innerHTML = renderChatMessageHtml(msg, conv);
    return holder.firstElementChild;
}
