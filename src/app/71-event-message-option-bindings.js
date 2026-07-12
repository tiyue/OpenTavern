/**
 * 新手导读（文件：71-event-message-option-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、消息、选项、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `getMessageOptionSendText(optionEl)`、`clearSelectedMessageOptions(container, exceptEl)`、`putMessageOptionInComposer(text)`、`activateMessageOption(optionEl, container)`、`bindMessageOptionEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
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
