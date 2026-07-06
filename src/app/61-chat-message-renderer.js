// ==================== Chat Message Renderer ====================
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

function renderMessages() {
    var conv = getActiveConv();
    if (!conv) return;
    var container = dom.messagesContainer;
    if (!container) return;

    // 【关键修复】对话切换时强制清空 DOM
    // newConversation / loadConversation 都会把目标 conv 的 _lastRenderedVisibleCount 显式重置为 0，
    // 但 requestRender('activeConvId') 只触发 renderMessagesOnly()，增量分支不会清空旧对话的 DOM 节点。
    // 这里用“count===0 但容器仍有子节点”作为切换特征，立即 innerHTML='' 避免旧消息视觉残留。
    if ((conv._lastRenderedVisibleCount || 0) === 0 && container.children.length > 0) {
        container.innerHTML = '';
    }

    var allMessages = conv.messages.filter(function(m) { return m.role !== 'system'; });

    if (allMessages.length === 0) {
        container.innerHTML = '';
        if (dom.emptyState) dom.emptyState.style.display = '';
        if (dom.tokenInfo) dom.tokenInfo.classList.add('hidden');
        return;
    }

    if (dom.emptyState) dom.emptyState.style.display = 'none';
    if (dom.tokenInfo) dom.tokenInfo.classList.remove('hidden');

    // === 增量 DOM 更新 + Windowed Rendering (支持长对话历史) ===
    // 默认只渲染最近 N 条以保持性能；用户向上滚动或点击按钮可加载更早消息
    var DEFAULT_WINDOW = 150;
    var historyWindow = conv._historyWindow || DEFAULT_WINDOW;

    // 如果用户显式要求查看所有历史消息，则跳过截断
    var showAll = !!conv._showAllMessages;
    if (showAll) historyWindow = Infinity;

    var startIdx = Math.max(0, allMessages.length - historyWindow);
    var visibleMessages = allMessages.slice(startIdx);

    // 尝试增量追加（最常见场景：只收到新消息）
    var lastRenderedCount = conv._lastRenderedVisibleCount || 0;
    var currentVisibleCount = visibleMessages.length;

    // 增量追加条件：
    // - 有新消息
    // - 当前不在流式生成中
    // - 没有处于“显示全部历史”模式
    // - 上次渲染的计数有效（由删除/切换对话等操作正确重置）
    var canIncremental = currentVisibleCount > lastRenderedCount &&
                         !state.isGenerating &&
                         !showAll;

    if (canIncremental) {

        // 增量追加新消息
        var fragment = document.createDocumentFragment();
        for (var i = lastRenderedCount; i < currentVisibleCount; i++) {
            var msg = visibleMessages[i];
            var isUser = msg.role === 'user';
            var senderName = getMessageSenderName(msg, conv);
            var actualIdx = conv.messages.indexOf(msg);

            var msgDiv = document.createElement('div');
            msgDiv.className = 'msg-enter ' + (isUser ? 'msg-user flex justify-end' : 'msg-assistant flex justify-start');
            msgDiv.innerHTML = `
                <div class="max-w-[80%] msg-wrapper">
                    ${!isUser ? `<p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">${escapeHtml(senderName)}</p>` : ''}
                    ${!isUser ? renderCotBlock(msg.cot) : ''}
                    <div class="msg-bubble">${renderMessageBubbleContent(msg, isUser)}</div>
                    <div class="msg-actions">
                        <button class="msg-action-btn copy-btn" data-action="copy" data-msg-idx="${actualIdx}" title="${t('copy')}">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="msg-action-btn edit-btn" data-action="edit" data-msg-idx="${actualIdx}" title="${t('edit_msg')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        ${!isUser ? `
                        <button class="msg-action-btn retry-btn" data-action="retry" data-msg-idx="${actualIdx}" title="${t('regenerate')}">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        </button>` : ''}
                        <button class="msg-action-btn del-btn" data-action="delete" data-msg-idx="${actualIdx}" title="${t('delete_msg')}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>`;

            fragment.appendChild(msgDiv);
        }
        container.appendChild(fragment);
        container.scrollTop = container.scrollHeight;

        conv._lastRenderedVisibleCount = currentVisibleCount;

        // 在增量追加后，确保顶部有加载更早历史的入口（如果有隐藏消息）
        ensureHistoryLoadUI(container, conv, allMessages, startIdx);
        return;
    }

    // 否则走全量渲染（删除、重试、第一次渲染、流式等）
    var html = '';

    if (startIdx > 0) {
        html += '<div class="flex justify-center py-3">';
        html += '<button id="loadEarlierBtn" class="px-4 py-1.5 text-xs rounded-2xl glass hover:bg-white/10 text-zinc-400 hover:text-zinc-300 transition-all">';
        html += '↑ 加载更早的消息 (' + startIdx + ' 条被隐藏)';
        html += '</button>';
        html += '</div>';
    }

    for (var i = 0; i < visibleMessages.length; i++) {
        var msg = visibleMessages[i];
        var isUser = msg.role === 'user';
        var senderName = getMessageSenderName(msg, conv);
        var actualIdx = conv.messages.indexOf(msg);

        html += '<div class="msg-enter ' + (isUser ? 'msg-user flex justify-end' : 'msg-assistant flex justify-start') + '">';
        html += '<div class="max-w-[80%] msg-wrapper">';
        if (!isUser) html += '<p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' + escapeHtml(senderName) + '</p>';
        if (!isUser) html += renderCotBlock(msg.cot);
        html += '<div class="msg-bubble">' + renderMessageBubbleContent(msg, isUser) + '</div>';
        html += '<div class="msg-actions">';
        html += '<button class="msg-action-btn copy-btn" data-action="copy" data-msg-idx="' + actualIdx + '" title="' + t('copy') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
        html += '<button class="msg-action-btn edit-btn" data-action="edit" data-msg-idx="' + actualIdx + '" title="' + t('edit_msg') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
        if (!isUser) {
            html += '<button class="msg-action-btn retry-btn" data-action="retry" data-msg-idx="' + actualIdx + '" title="' + t('regenerate') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>';
        }
        html += '<button class="msg-action-btn del-btn" data-action="delete" data-msg-idx="' + actualIdx + '" title="' + t('delete_msg') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
        html += '</div>';
        html += '</div></div>';
    }

    if (state.isGenerating) {
        html += '<div id="streamingMsg" class="msg-assistant flex justify-start">';
        html += '<div class="max-w-[80%]">';
        // 流式时尽量使用当前群组发言者（如果有）
        var streamingSpeaker = getCurrentGeneratingSpeakerName(conv);
        html += '<p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' + escapeHtml(streamingSpeaker) + '</p>';
        html += '<div id="streamingCot"></div>';
        html += '<div class="msg-bubble typing-cursor" id="streamingContent"></div>';
        html += '</div></div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;

    conv._lastRenderedVisibleCount = currentVisibleCount;

    // Wire the "load earlier" button (使用增量加载而非一次性全部加载，适合长对话)
    var loadBtn = document.getElementById('loadEarlierBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', function() {
            loadMoreHistory(conv, container);
        });
    }

    // 确保滚动加载处理器已附加
    ensureHistoryLoadUI(container, conv, allMessages, startIdx);
}

// Fallback: render all messages (used when user explicitly wants older history)
function renderMessagesFullHistory(conv) {
    if (conv) {
        conv._lastRenderedVisibleCount = 0;   // 全量渲染后增量计数失效
    }
    var container = dom.messagesContainer;
    var messages = conv.messages.filter(function(m) { return m.role !== 'system'; });

    var html = '';
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        var isUser = msg.role === 'user';
        var senderName = getMessageSenderName(msg, conv);
        var actualIdx = conv.messages.indexOf(msg);

        html += '<div class="msg-enter ' + (isUser ? 'msg-user flex justify-end' : 'msg-assistant flex justify-start') + '">';
        html += '<div class="max-w-[80%] msg-wrapper">';
        if (!isUser) html += '<p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' + escapeHtml(senderName) + '</p>';
        if (!isUser) html += renderCotBlock(msg.cot);
        html += '<div class="msg-bubble">' + renderMessageBubbleContent(msg, isUser) + '</div>';
        html += '<div class="msg-actions">';
        html += '<button class="msg-action-btn copy-btn" data-action="copy" data-msg-idx="' + actualIdx + '" title="' + t('copy') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
        html += '<button class="msg-action-btn edit-btn" data-action="edit" data-msg-idx="' + actualIdx + '" title="' + t('edit_msg') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
        if (!isUser) {
            html += '<button class="msg-action-btn retry-btn" data-action="retry" data-msg-idx="' + actualIdx + '" title="' + t('regenerate') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>';
        }
        html += '<button class="msg-action-btn del-btn" data-action="delete" data-msg-idx="' + actualIdx + '" title="' + t('delete_msg') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
        html += '</div>';
        html += '</div></div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}
