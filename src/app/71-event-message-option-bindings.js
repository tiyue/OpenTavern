// ==================== Message Option Event Bindings ====================
function getMessageOptionSendText(optionEl) {
    if (!optionEl) return '';
    var title = String(optionEl.getAttribute('data-option-title') || '').trim();
    var description = String(optionEl.getAttribute('data-option-description') || '').trim();
    if (title || description) return [title, description].filter(Boolean).join('\n\n');
    return String(optionEl.getAttribute('data-option-send-text') || '').trim();
}

function clearSelectedMessageOptions(container, exceptEl) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    var selected = container.querySelectorAll('.message-option-choice[aria-pressed="true"]');
    Array.prototype.forEach.call(selected, function(optionEl) {
        if (optionEl !== exceptEl) optionEl.setAttribute('aria-pressed', 'false');
    });
}

function putMessageOptionInComposer(text) {
    if (!dom.messageInput) return;
    dom.messageInput.value = text;
    if (typeof dom.messageInput.dispatchEvent === 'function' && typeof Event === 'function') {
        dom.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function activateMessageOption(optionEl, container) {
    if (!optionEl || state.isGenerating) return 'blocked';
    var text = getMessageOptionSendText(optionEl);
    if (!text) return 'ignored';

    if (optionEl.getAttribute('aria-pressed') !== 'true') {
        clearSelectedMessageOptions(container, optionEl);
        optionEl.setAttribute('aria-pressed', 'true');
        putMessageOptionInComposer(text);
        return 'selected';
    }

    if (!dom.messageInput || dom.messageInput.disabled) return 'blocked';
    putMessageOptionInComposer(text);
    sendMessage();
    return 'sent';
}

function bindMessageOptionEvents() {
    if (!dom.messagesContainer) return;
    dom.messagesContainer.addEventListener('click', function(e) {
        var optionEl = e.target && e.target.closest ? e.target.closest('.message-option-choice') : null;
        if (!optionEl) return;
        activateMessageOption(optionEl, dom.messagesContainer);
    });
}
