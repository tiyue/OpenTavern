/**
 * 新手导读（文件：61-chat-message-renderer.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、渲染器”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderMessages(无参数)`、`renderMessagesFullHistory(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Message Renderer ====================
/**
 * 把当前会话的消息状态同步到聊天区域的 HTML。
 *
 * 输入/返回：无参数、无返回值；它读取当前会话并直接更新 dom.messagesContainer。
 * 先处理切换会话后的旧 DOM，再取得允许显示的消息。如果没有消息就显示空状态；如果只比上次
 * 多了少量新消息，就走增量追加以减少卡顿；否则重建当前可见窗口，并补上“加载更早消息”入口。
 *
 * “渲染”只负责显示，不应在这里修改或保存消息数据。消息正文最终插入 HTML 前必须继续经过
 * renderChatMessagesHtml 等安全格式化函数，不能直接把模型原文赋给 innerHTML。
 */
function renderMessages() {
    if (typeof pruneCardRuntimeInstances === 'function') pruneCardRuntimeInstances();
    var conv = getActiveConv();
    if (!conv) return;
    var container = dom.messagesContainer;
    if (!container) return;

    clearMessageContainerAfterConversationSwitch(container, conv);

    var allMessages = getRenderableChatMessages(conv);
    if (allMessages.length === 0) {
        renderChatMessageEmptyState(container);
        return;
    }
    setChatMessageEmptyStateVisible(false);

    var windowState = getChatMessageWindowState(conv, allMessages);
    renderChatMessageWindow(container, conv, allMessages, windowState);
    if (typeof mountCardRuntimeFrames === 'function') mountCardRuntimeFrames(container);
}

function renderMessagesFullHistory(conv) {
    if (conv) {
        conv._lastRenderedVisibleCount = 0;
    }
    var container = dom.messagesContainer;
    var messages = getRenderableChatMessages(conv);
    var html = renderChatMessagesHtml(messages, conv);

    container.innerHTML = html;
    if (typeof mountCardRuntimeFrames === 'function') mountCardRuntimeFrames(container);
    container.scrollTop = container.scrollHeight;
}
