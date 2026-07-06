// 手动渲染订阅表（必须通过 appStore.notify('key') 显式触发）
// 由于已移除自动响应式，状态修改后需要主动调用 notify 或直接调用渲染函数
var renderSubscriptions = {
    'conversations': renderConversationList,
    'conversationOrder': renderConversationList,
    'activeConvId': function() {
        renderConversationListOnly();
        renderMessagesOnly();
        renderCharacterUI();
        renderWorldInfoBudgetWarning();
    },
    'isGenerating': function() {
        updateInputState();
        // 不再自动调用 renderMessagesOnly()：
        // - 启动生成时，onToken 会在首次收到 token 时手动创建 streaming 气泡
        // - 完成时，appendFinalAssistantMessage 负责增量追加最终 AI 消息（避免滚动跳动）
        // - 之前这里会触发 renderMessagesOnly + appendFinal 两条路径，配合 activeConvId 切换时的 DOM 残留，容易产生重复消息
    },
    'settings': function() {
        updateInputState();
        renderTopBar();
    },
    'worldInfo': function() {
        renderWorldInfoBudgetWarning();
    }
};

// 只有当代码显式调用 appStore.notify('xxx') 时才会触发对应渲染
appStore.subscribe(function(changedKeys) {
    changedKeys.forEach(function(key) {
        if (renderSubscriptions[key]) {
            try {
                renderSubscriptions[key]();
            } catch (e) {
                console.error('Render error for key:', key, e);
            }
        }
    });
});

// ==================== 渲染辅助函数（当前推荐做法） ====================
// 注意：由于已移除自动响应式状态管理，这些函数只是便捷封装。
// 状态修改后请显式调用对应渲染函数或 requestRender / requestFullRender。

function requestFullRender() {
    renderAll();
}

function requestRender(key) {
    if (Array.isArray(key)) {
        appStore.notify(key);
    } else {
        appStore.notify([key]);
    }
}

function renderMessagesOnly() {
    if (dom.messagesContainer) renderMessages();
}

// 流式完成后增量追加最终消息（避免全量重绘导致滚动跳到底部）
function appendFinalAssistantMessage(conv, fullContent, fullCot) {
    if (!conv || !dom.messagesContainer || !fullContent) return;

    // 防护：如果当前激活的对话已经不是这个 conv 了（用户切换了对话），直接放弃追加
    // 避免在快速切换对话后，旧的流式完成回调错误地往当前对话里重复追加消息
    var activeConv = getActiveConv();
    if (!activeConv || activeConv.id !== conv.id) {
        return;
    }

    var container = dom.messagesContainer;
    // 使用消息自带的 speaker（如果有）或通过 helper 获取
    var lastMsg = conv.messages[conv.messages.length - 1];
    var senderName = getMessageSenderName(lastMsg, conv);
    var actualIdx = conv.messages.length - 1; // 刚 push 进去的索引

    var msgDiv = document.createElement('div');
    msgDiv.className = 'msg-enter msg-assistant flex justify-start';
    msgDiv.innerHTML = `
        <div class="max-w-[80%] msg-wrapper">
            <p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">${escapeHtml(senderName)}</p>
            ${renderCotBlock(fullCot)}
            <div class="msg-bubble">${renderAssistantContent(fullContent)}</div>
            <div class="msg-actions">
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

    container.appendChild(msgDiv);

    // 更新增量渲染计数
    if (typeof conv._lastRenderedVisibleCount === 'number') {
        conv._lastRenderedVisibleCount += 1;
    }

    // 只有当用户当前在底部时才自动滚动到底部
    var isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }

    // 更新 token 信息栏（函数独立性考虑，即使调用方也会调用一次）
    renderTokenBar();
}

function renderConversationListOnly() {
    if (dom.convList) renderConversationList();
}

function renderCharacterUI() {
    renderCharacterCard();
    renderTopBar();
}
