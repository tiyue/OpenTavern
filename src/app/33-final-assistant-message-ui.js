// ==================== Final Assistant Message UI ====================
function appendFinalAssistantMessage(conv, fullContent, fullCot) {
    if (!conv || !dom.messagesContainer || !fullContent) return;

    var activeConv = getActiveConv();
    if (!activeConv || activeConv.id !== conv.id) {
        return;
    }

    var container = dom.messagesContainer;
    var actualIdx = conv.messages.length - 1;
    var msgDiv = document.createElement('div');
    msgDiv.className = 'msg-enter msg-assistant flex justify-start';
    msgDiv.innerHTML = buildFinalAssistantMessageHtml(conv, fullContent, fullCot, actualIdx);

    container.appendChild(msgDiv);
    incrementConversationVisibleCount(conv);
    scrollFinalAssistantMessageIfNearBottom(container);
    renderTokenBar();
}

function buildFinalAssistantMessageHtml(conv, fullContent, fullCot, actualIdx) {
    var lastMsg = conv.messages[conv.messages.length - 1];
    var senderName = getMessageSenderName(lastMsg, conv);
    return `
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
