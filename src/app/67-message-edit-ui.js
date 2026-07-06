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

    function restoreOriginal() {
        closed = true;
        bubble.innerHTML = originalHTML;
    }

    function saveEdit() {
        if (closed) return;
        closed = true;

        var result = applyMessageEditContent(conv, actualIdx, originalContent, ta.value);
        if (result === 'changed') {
            persistState();
            renderMessagesOnly();
            renderConversationListOnly();
        } else {
            bubble.innerHTML = originalHTML;
        }
    }

    ta.addEventListener('input', function() { autoResizeMessageEditTextarea(ta); });
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
    setTimeout(function() { autoResizeMessageEditTextarea(ta); }, 0);
}
