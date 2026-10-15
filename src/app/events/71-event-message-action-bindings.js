/**
 * 新手导读（文件：71-event-message-action-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、消息、操作、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindMessageActionEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Message Action Event Bindings ====================
function bindMessageActionEvents() {
    dom.messagesContainer.addEventListener('click', function(e) {
        var runtimeButton = e.target.closest('[data-card-runtime-token][data-action]');
        if (runtimeButton && typeof handleCardRuntimeAction === 'function') {
            handleCardRuntimeAction(runtimeButton.getAttribute('data-action'), runtimeButton);
            return;
        }
        var btn = e.target.closest('.msg-action-btn');
        if (!btn) return;

        var action = btn.getAttribute('data-action');
        var idx = parseInt(btn.getAttribute('data-msg-idx'));
        // 复用的行节点索引可能已过期，优先按行上的稳定消息 ID 解析当前索引。
        var actionConv = getActiveConv();
        var actionRow = btn.closest('[data-message-id]');
        if (actionRow && actionConv && typeof resolveActiveConversationMessageIndex === 'function') {
            var resolvedIdx = resolveActiveConversationMessageIndex(actionConv, actionRow.getAttribute('data-message-id'));
            if (resolvedIdx >= 0) idx = resolvedIdx;
        }
        if (isNaN(idx)) return;

        if (action === 'copy') {
            var conv = getActiveConv();
            if (conv && conv.messages[idx]) {
                copyMessageText(conv.messages[idx].content);
            }
        } else if (action === 'delete') {
            deleteMessage(idx);
        } else if (action === 'retry') {
            if (state.isGenerating) return;
            regenerateMessage(idx);
        } else if (action === 'edit') {
            editMessage(idx, btn);
        } else if (action === 'version-prev' || action === 'version-next') {
            switchResponseVersion(idx, action === 'version-prev' ? -1 : 1);
        } else if (action === 'favorite') {
            var current = getActiveConv();
            toggleMessageFavorite(current, current.messages[idx].id).catch(function(error) { alert(error.message); });
        } else if (action === 'continue') {
            var current = getActiveConv();
            if (!state.isGenerating && !current._messageCommitInProgress && canContinueMessage(current, current.messages[idx])) startPrimaryMessageRegeneration(current, current.messages[idx], true);
        } else if (action === 'greeting') {
            openConversationGreetings();
        }
    });
}
