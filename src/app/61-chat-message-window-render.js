/**
 * 新手导读（文件：61-chat-message-window-render.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、窗口、渲染”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `appendIncrementalChatMessages(container, conv, windowState)`、`renderChatMessageWindow(container, conv, allMessages, windowState)`、`buildStreamingMessageHtml(conv)`、`wireLoadEarlierMessagesButton(conv, container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Message Window Render ====================
function appendIncrementalChatMessages(container, conv, windowState) {
    var fragment = document.createDocumentFragment();
    for (var i = windowState.lastRenderedCount; i < windowState.currentVisibleCount; i++) {
        fragment.appendChild(createChatMessageElement(windowState.visibleMessages[i], conv));
    }
    container.appendChild(fragment);
    container.scrollTop = container.scrollHeight;
    conv._lastRenderedVisibleCount = windowState.currentVisibleCount;
}

function renderChatMessageWindow(container, conv, allMessages, windowState) {
    var html = '';
    if (windowState.startIdx > 0) {
        html += buildLoadEarlierMessagesButtonHtml(windowState.startIdx);
    }
    html += renderChatMessagesHtml(windowState.visibleMessages, conv);
    if (state.isGenerating) {
        html += buildStreamingMessageHtml(conv);
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
    conv._lastRenderedVisibleCount = windowState.currentVisibleCount;
    wireLoadEarlierMessagesButton(conv, container);
    ensureHistoryLoadUI(container, conv, allMessages, windowState.startIdx);
}

function buildStreamingMessageHtml(conv) {
    var streamingSpeaker = getCurrentGeneratingSpeakerName(conv);
    return '<div id="streamingMsg" class="msg-assistant flex justify-start">' +
        '<div class="max-w-[80%]">' +
        '<p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' + escapeHtml(streamingSpeaker) + '</p>' +
        '<div id="streamingCot"></div>' +
        '<div class="msg-bubble typing-cursor" id="streamingContent"></div>' +
        '</div></div>';
}

function wireLoadEarlierMessagesButton(conv, container) {
    bindLoadEarlierMessagesButton(getLoadEarlierMessagesButtonFromDocument(), conv, container);
}
