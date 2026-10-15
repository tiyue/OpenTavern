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
 * 让消息列表顶部的“加载更早历史”按钮与当前窗口一致：
 * 需要时插入一次并绑定事件，隐藏条数变化时只更新按钮文案，不需要时移除。
 */
function syncChatHistoryLoadUi(container, conv, windowState) {
    if (!container || !conv || !windowState) return null;
    var hiddenCount = Math.max(0, windowState.startIdx || 0);
    var existingButton = typeof getLoadEarlierMessagesButtonFromDocument === 'function' ? getLoadEarlierMessagesButtonFromDocument() : null;
    var existingWrapper = existingButton && existingButton.parentNode && existingButton.parentNode.parentNode === container ? existingButton.parentNode : null;

    if (hiddenCount <= 0) {
        if (existingWrapper) container.removeChild(existingWrapper);
        return null;
    }
    if (existingWrapper) {
        updateChatHistoryLoadButtonLabel(existingWrapper, hiddenCount);
        return existingWrapper;
    }

    var holder = document.createElement('div');
    holder.innerHTML = buildIncrementalLoadEarlierMessagesButtonHtml(hiddenCount);
    var wrapper = holder.firstElementChild;
    if (!wrapper) return null;
    wrapper.setAttribute('data-hidden-count', String(hiddenCount));
    bindLoadEarlierMessagesButton(wrapper.querySelector('#' + LOAD_EARLIER_MESSAGES_BUTTON_ID), conv, container);
    attachChatHistoryScrollAutoLoad(container, conv);
    return wrapper;
}

function updateChatHistoryLoadButtonLabel(wrapper, hiddenCount) {
    if (wrapper.getAttribute('data-hidden-count') === String(hiddenCount)) return;
    wrapper.setAttribute('data-hidden-count', String(hiddenCount));
    var button = wrapper.querySelector('#' + LOAD_EARLIER_MESSAGES_BUTTON_ID);
    if (!button) return;
    var holder = document.createElement('div');
    holder.innerHTML = buildIncrementalLoadEarlierMessagesButtonHtml(hiddenCount);
    var fresh = holder.querySelector('#' + LOAD_EARLIER_MESSAGES_BUTTON_ID);
    if (fresh) button.textContent = fresh.textContent;
}

function attachChatHistoryScrollAutoLoad(container, conv) {
    if (conv._historyScrollHandler) return;
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

function ensureHistoryLoadUI(container, conv, allMessages, currentStartIdx) {
    return syncChatHistoryLoadUi(container, conv, { startIdx: currentStartIdx });
}

/** 加载更多历史消息（增加窗口大小并重新渲染） */
function loadMoreHistory(conv, container, silent) {
    if (!conv) return;

    var currentWindow = conv._historyWindow || 150;
    conv._historyWindow = currentWindow + 100;  // 每次多加载 100 条

    // 触发重新渲染；渲染会按稳定 ID 恢复滚动锚点，不再手动清空容器。
    renderMessages();

    if (!silent) {
        // 可选：如果用户想一次看全，可以在这里提供额外提示
    }
}
