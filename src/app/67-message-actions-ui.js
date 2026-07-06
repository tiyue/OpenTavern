// ==================== Message Actions ====================
function deleteMessage(actualIdx) {
    var conv = getActiveConv();
    if (!conv) return;
    var msg = conv.messages[actualIdx];
    if (!msg) return;
    if (msg.role === 'user') {
        var deleteCount = 1;
        var scanIdx = actualIdx + 1;
        while (scanIdx < conv.messages.length && conv.messages[scanIdx].role === 'assistant') {
            deleteCount++;
            scanIdx++;
            if (deleteCount >= 3) break;
        }
        conv.messages.splice(actualIdx, deleteCount);
    } else {
        if (msg.stage !== 'second') {
            removeLinkedSecondStageMessages(conv, msg);
            actualIdx = conv.messages.indexOf(msg);
        }
        conv.messages.splice(actualIdx, 1);
    }
    conv.updated = Date.now();
    if (conv) {
        conv._wiCache = null;
        conv._lastRenderedVisibleCount = 0;   // 消息被删除 → 增量状态失效
    }
    persistState();
    renderMessagesOnly();
    renderConversationListOnly();
}

function regenerateMessage(actualIdx) {
    if (state.isGenerating) return;
    var conv = getActiveConv();
    if (!conv) return;
    var msg = conv.messages[actualIdx];
    if (!msg || msg.role !== 'assistant') return;

    if (msg.stage === 'second') {
        var parent = conv.messages.find(function(m) { return m && m.id && m.id === msg.parentId; });
        conv.messages.splice(actualIdx, 1);
        conv.updated = Date.now();
        conv._wiCache = null;
        conv._lastRenderedVisibleCount = 0;
        persistState();
        renderMessagesOnly();
        if (parent) runSecondStageGeneration(parent, function() { completeGenerationTurn(conv); });
        return;
    }

    removeLinkedSecondStageMessages(conv, msg);
    actualIdx = conv.messages.indexOf(msg);
    if (actualIdx >= 0) conv.messages.splice(actualIdx, 1);
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    persistState();
    renderMessagesOnly();
    renderConversationListOnly();

    var lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return;

    if (isGroupChat(conv)) {
        const mentioned = parseGroupMention(lastMsg.content || '', conv);
        conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
    }

    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            handlePrimaryAssistantComplete,
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('Error: ' + (err.message || err));
            }
        );
        updateInputState();
    };

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(start).catch(function(e) {
            state.isGenerating = false;
            appStore.notify('isGenerating');
            renderMessagesOnly();
            alert('Error: ' + (e.message || e));
        });
    } else {
        start();
    }
}

function copyMessageText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            // Brief visual feedback could be added here
        });
    }
}

/**
 * 内联编辑消息内容（支持用户消息和助手消息）
 * 通过传入触发的按钮元素来准确定位对应的气泡 DOM
 */
function editMessage(actualIdx, triggerBtn) {
    var conv = getActiveConv();
    if (!conv || !conv.messages[actualIdx]) return;
    if (state.isGenerating) return; // 生成中禁止编辑

    var msg = conv.messages[actualIdx];
    var originalContent = msg.content || '';

    // 找到对应的 msg-wrapper 和 bubble
    var bubble = null;
    if (triggerBtn) {
        var wrapper = triggerBtn.closest('.msg-wrapper');
        if (wrapper) bubble = wrapper.querySelector('.msg-bubble');
    }
    if (!bubble) {
        // 兜底：通过 data-msg-idx 查找
        var btn = dom.messagesContainer.querySelector('.msg-action-btn[data-action="edit"][data-msg-idx="' + actualIdx + '"]');
        if (btn) {
            var w = btn.closest('.msg-wrapper');
            if (w) bubble = w.querySelector('.msg-bubble');
        }
    }
    if (!bubble) {
        // 最后兜底：直接全量重渲染后进入编辑（较少发生）
        conv.messages[actualIdx].content = originalContent; // 占位
        renderMessagesOnly();
        return;
    }

    // 记录原始气泡的实际渲染宽度（关键：保留原有对话框大小）
    var originalBubbleWidth = bubble.offsetWidth;

    // 创建编辑态 textarea（保留原有宽度 + 允许高度自动扩展）
    var ta = document.createElement('textarea');
    ta.value = originalContent;
    // 注意：不再使用 w-full，而是通过 JS 精确设置宽度，保留原消息气泡的视觉宽度
    ta.className = 'px-3 py-2.5 glass rounded-2xl text-[0.95rem] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-y leading-relaxed';
    ta.style.fontFamily = 'inherit';
    ta.style.boxSizing = 'border-box';
    ta.style.width = originalBubbleWidth + 'px';
    ta.style.maxWidth = '100%'; // 防止极端情况下溢出

    // 短消息保护：给予一个最小可用编辑宽度，避免极短消息编辑极度狭窄
    // 但仍尽量尊重原气泡的实际宽度
    if (originalBubbleWidth < 280) {
        ta.style.minWidth = Math.min(280, originalBubbleWidth * 1.15) + 'px';
    }

    // 保存原始内容以便取消
    var originalHTML = bubble.innerHTML;
    bubble.innerHTML = '';
    bubble.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    // 自动高度调整（编辑长消息时更友好）
    function autoResizeTextarea() {
        ta.style.height = 'auto';
        var maxHeight = 420; // 最大高度限制
        ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
    }
    ta.addEventListener('input', autoResizeTextarea);
    // 初始自适应
    setTimeout(autoResizeTextarea, 0);

    function saveEdit() {
        var newVal = ta.value.trim();
        if (newVal !== originalContent) {
            conv.messages[actualIdx].content = newVal;
            if (conv.messages[actualIdx].role === 'assistant' && conv.messages[actualIdx].stage !== 'second') {
                removeLinkedSecondStageMessages(conv, conv.messages[actualIdx]);
            }
            conv.updated = Date.now();
            conv._wiCache = null;
            conv._lastRenderedVisibleCount = 0;
            persistState();
            renderMessagesOnly();
            renderConversationListOnly();
        } else {
            // 内容没变，直接恢复
            bubble.innerHTML = originalHTML;
        }
    }

    function cancelEdit() {
        bubble.innerHTML = originalHTML;
    }

    ta.addEventListener('blur', saveEdit);
    ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}
