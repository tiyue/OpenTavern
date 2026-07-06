// ==================== Message Edit Helpers ====================
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

function autoResizeMessageEditTextarea(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 420) + 'px';
}

function applyMessageEditContent(conv, actualIdx, originalContent, editedContent) {
    var msg = conv.messages[actualIdx];
    if (!msg) return 'missing';

    var newVal = String(editedContent || '').trim();
    if (newVal === originalContent) return 'unchanged';

    msg.content = newVal;
    if (msg.role === 'assistant' && msg.stage !== 'second') {
        removeLinkedSecondStageMessages(conv, msg);
    }
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    return 'changed';
}
