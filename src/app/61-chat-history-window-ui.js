// ==================== Chat History Window UI ====================
/**
 * 确保消息列表顶部有“加载更早历史”的UI
 * 支持点击加载更多（增量增加窗口），并附加滚动到顶部自动加载
 */
function ensureHistoryLoadUI(container, conv, allMessages, currentStartIdx) {
    if (!container || !conv || !allMessages) return;

    var hasHidden = currentStartIdx > 0;
    var existingBtn = document.getElementById('loadEarlierBtn');

    if (!hasHidden) {
        if (existingBtn) existingBtn.remove();
        return;
    }

    // 如果按钮已存在，就不重复添加
    if (existingBtn) return;

    var btnContainer = document.createElement('div');
    btnContainer.className = 'flex justify-center py-2';
    btnContainer.innerHTML = `
        <button id="loadEarlierBtn" class="px-4 py-1.5 text-xs rounded-2xl glass hover:bg-white/10 text-zinc-400 hover:text-zinc-300 transition-all">
            ↑ 加载更早的消息（还有 ${currentStartIdx} 条）
        </button>
    `;
    // 插入到最顶部
    if (container.firstChild) {
        container.insertBefore(btnContainer, container.firstChild);
    } else {
        container.appendChild(btnContainer);
    }

    var loadBtn = btnContainer.querySelector('#loadEarlierBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', function() {
            loadMoreHistory(conv, container);
        });
    }

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
