// ==================== Message Copy/Edit UI ====================
function copyMessageText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            // Brief visual feedback could be added here.
        });
    }
}

function editMessage(actualIdx, triggerBtn) {
    var conv = getActiveConv();
    if (!conv || !conv.messages[actualIdx]) return;
    if (state.isGenerating) return;

    var originalContent = conv.messages[actualIdx].content || '';
    var bubble = findEditableMessageBubble(actualIdx, triggerBtn);
    if (!bubble) {
        renderMessagesOnly();
        return;
    }

    var originalHTML = bubble.innerHTML;
    var ta = createMessageEditTextarea(originalContent, bubble.offsetWidth);
    var closed = false;

    bubble.innerHTML = '';
    bubble.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    function autoResizeTextarea() {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 420) + 'px';
    }

    function restoreOriginal() {
        closed = true;
        bubble.innerHTML = originalHTML;
    }

    function saveEdit() {
        if (closed) return;
        closed = true;

        var msg = conv.messages[actualIdx];
        if (!msg) {
            bubble.innerHTML = originalHTML;
            return;
        }

        var newVal = ta.value.trim();
        if (newVal !== originalContent) {
            msg.content = newVal;
            if (msg.role === 'assistant' && msg.stage !== 'second') {
                removeLinkedSecondStageMessages(conv, msg);
            }
            conv.updated = Date.now();
            conv._wiCache = null;
            conv._lastRenderedVisibleCount = 0;
            persistState();
            renderMessagesOnly();
            renderConversationListOnly();
        } else {
            bubble.innerHTML = originalHTML;
        }
    }

    ta.addEventListener('input', autoResizeTextarea);
    ta.addEventListener('blur', saveEdit);
    ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreOriginal();
        }
    });
    setTimeout(autoResizeTextarea, 0);
}

function findEditableMessageBubble(actualIdx, triggerBtn) {
    if (triggerBtn) {
        var wrapper = triggerBtn.closest('.msg-wrapper');
        if (wrapper) {
            var bubble = wrapper.querySelector('.msg-bubble');
            if (bubble) return bubble;
        }
    }

    var btn = dom.messagesContainer.querySelector('.msg-action-btn[data-action="edit"][data-msg-idx="' + actualIdx + '"]');
    if (!btn) return null;

    var fallbackWrapper = btn.closest('.msg-wrapper');
    return fallbackWrapper ? fallbackWrapper.querySelector('.msg-bubble') : null;
}

function createMessageEditTextarea(originalContent, originalBubbleWidth) {
    var ta = document.createElement('textarea');
    ta.value = originalContent;
    ta.className = 'px-3 py-2.5 glass rounded-2xl text-[0.95rem] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-y leading-relaxed';
    ta.style.fontFamily = 'inherit';
    ta.style.boxSizing = 'border-box';
    ta.style.width = originalBubbleWidth + 'px';
    ta.style.maxWidth = '100%';
    if (originalBubbleWidth < 280) {
        ta.style.minWidth = Math.min(280, originalBubbleWidth * 1.15) + 'px';
    }
    return ta;
}
