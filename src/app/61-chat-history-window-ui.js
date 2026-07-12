/**
 * 新手导读（文件：61-chat-history-window-ui.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、历史记录、窗口、界面”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `ensureHistoryLoadUI(container, conv, allMessages, currentStartIdx)`、`loadMoreHistory(conv, container, silent)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat History Window UI ====================
/**
 * 确保消息列表顶部有“加载更早历史”的UI
 * 支持点击加载更多（增量增加窗口），并附加滚动到顶部自动加载
 */
function ensureHistoryLoadUI(container, conv, allMessages, currentStartIdx) {
    if (!container || !conv || !allMessages) return;

    var hasHidden = currentStartIdx > 0;
    var existingBtn = getLoadEarlierMessagesButtonFromDocument();

    if (!hasHidden) {
        if (existingBtn) existingBtn.remove();
        return;
    }

    // 如果按钮已存在，就不重复添加
    if (existingBtn) return;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildIncrementalLoadEarlierMessagesButtonHtml(currentStartIdx);
    var btnContainer = wrapper.firstElementChild;
    if (!btnContainer) return;
    // 插入到最顶部
    if (container.firstChild) {
        container.insertBefore(btnContainer, container.firstChild);
    } else {
        container.appendChild(btnContainer);
    }

    bindLoadEarlierMessagesButton(btnContainer.querySelector('#' + LOAD_EARLIER_MESSAGES_BUTTON_ID), conv, container);

    // 附加一次性的向上滚动自动加载（仅当还有隐藏消息时）
    if (!conv._historyScrollHandler) {
        conv._historyScrollHandler = function() {
            if (container.scrollTop < 80 && !state.isGenerating) {
                var currentAll = conv.messages.filter(function(m) { return m.role !== 'system'; });
                var currentWindow = conv._historyWindow || 150;
                if (currentAll.length > currentWindow) {
                    loadMoreHistory(conv, container, true); // silent = true 时不显示提示
                }
            }
        };
        container.addEventListener('scroll', conv._historyScrollHandler, { passive: true });
    }
}

/** 加载更多历史消息（增加窗口大小并重新渲染） */
function loadMoreHistory(conv, container, silent) {
    if (!conv) return;

    var currentWindow = conv._historyWindow || 150;
    conv._historyWindow = currentWindow + 100;  // 每次多加载 100 条

    // 保存当前滚动位置（从底部算），以便加载后尽量保持视觉
    var distFromBottom = container.scrollHeight - container.scrollTop;

    container.innerHTML = '';
    conv._lastRenderedVisibleCount = 0;

    // 触发重新渲染（会走 windowed 逻辑，使用新的 _historyWindow）
    renderMessages();

    // 恢复滚动位置，尽量不让用户感觉跳动
    setTimeout(function() {
        if (container) {
            container.scrollTop = container.scrollHeight - distFromBottom;
        }
    }, 0);

    if (!silent) {
        // 可选：如果用户想一次看全，可以在这里提供额外提示
    }
}
