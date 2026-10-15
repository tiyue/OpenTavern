/**
 * 新手导读（文件：33-final-assistant-message-ui.js）
 *
 * 负责什么：这是“消息完成与界面刷新”中的“最终助手消息、界面”部分。
 * 在程序中的位置：它在回复完成后更新消息区域，并用订阅把状态变化传给各界面。
 * 从哪里开始看：主要从 `appendFinalAssistantMessage(conv, fullContent, fullCot)`、`buildFinalAssistantMessageHtml(conv, fullContent, fullCot, actualIdx)`、`incrementConversationVisibleCount(conv)`、`scrollFinalAssistantMessageIfNearBottom(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：持久化状态与刷新页面的先后顺序会影响用户是否看到最新消息。
 */
// ==================== Final Assistant Message UI ====================
function appendFinalAssistantMessage(conv, fullContent, fullCot) {
    if (!conv || !dom.messagesContainer || !fullContent) return;

    var activeConv = getActiveConv();
    if (!activeConv || activeConv.id !== conv.id) {
        return;
    }

    var container = dom.messagesContainer;
    var actualIdx = conv.messages.length - 1;
    var lastMsg = conv.messages[actualIdx];
    var msgDiv;
    // 与窗口渲染共用同一行构造与签名登记，下一次渲染可以直接复用这个节点。
    if (typeof createChatMessageElement === 'function' && lastMsg && lastMsg.id) {
        msgDiv = createChatMessageElement(lastMsg, conv);
        if (typeof registerRenderedChatMessageRow === 'function') registerRenderedChatMessageRow(conv, lastMsg, msgDiv);
    } else {
        msgDiv = document.createElement('div');
        msgDiv.className = 'msg-enter msg-assistant flex justify-start';
        msgDiv.innerHTML = buildFinalAssistantMessageHtml(conv, fullContent, fullCot, actualIdx);
    }

    container.appendChild(msgDiv);
    if (typeof mountCardRuntimeFrames === 'function') mountCardRuntimeFrames(container);
    incrementConversationVisibleCount(conv);
    scrollFinalAssistantMessageIfNearBottom(container);
    renderTokenBar();
}

function buildFinalAssistantMessageHtml(conv, fullContent, fullCot, actualIdx) {
    var lastMsg = conv.messages[conv.messages.length - 1];
    var senderName = getMessageSenderName(lastMsg, conv);
    var messageCharacter = getMessageSpeakerCharacter(lastMsg, conv);
    var renderContext = { conv: conv, msg: lastMsg, character: messageCharacter };
    return `
        <div class="max-w-[80%] msg-wrapper">
            ${renderAssistantSenderHtml(senderName, messageCharacter)}
            ${renderCotBlock(fullCot, false, renderContext)}
            <div class="msg-bubble">${renderAssistantContent(fullContent, renderContext)}</div>
            ${renderMsgTokenMeta(lastMsg)}
            <div class="msg-actions">
                ${renderResponseVersionControls(lastMsg, actualIdx)}
                <button class="msg-action-btn copy-btn" data-action="copy" data-msg-idx="${actualIdx}" title="${t('copy')}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button class="msg-action-btn edit-btn" data-action="edit" data-msg-idx="${actualIdx}" title="${t('edit_msg')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="msg-action-btn retry-btn" data-action="retry" data-msg-idx="${actualIdx}" title="${t('regenerate')}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button class="msg-action-btn del-btn" data-action="delete" data-msg-idx="${actualIdx}" title="${t('delete_msg')}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>`;
}

function incrementConversationVisibleCount(conv) {
    if (typeof conv._lastRenderedVisibleCount === 'number') {
        conv._lastRenderedVisibleCount += 1;
    }
}

function scrollFinalAssistantMessageIfNearBottom(container) {
    var isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}
