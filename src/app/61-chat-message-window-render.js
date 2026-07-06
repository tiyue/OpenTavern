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

function buildLoadEarlierMessagesButtonHtml(hiddenCount) {
    return '<div class="flex justify-center py-3">' +
        '<button id="loadEarlierBtn" class="px-4 py-1.5 text-xs rounded-2xl glass hover:bg-white/10 text-zinc-400 hover:text-zinc-300 transition-all">' +
        '\u2191 \u52a0\u8f7d\u66f4\u65e9\u7684\u6d88\u606f (' + hiddenCount + ' \u6761\u88ab\u9690\u85cf)' +
        '</button>' +
        '</div>';
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
    var loadBtn = document.getElementById('loadEarlierBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', function() {
            loadMoreHistory(conv, container);
        });
    }
}
