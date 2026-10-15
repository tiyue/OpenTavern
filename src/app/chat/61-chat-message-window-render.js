/**
 * 新手导读（文件：61-chat-message-window-render.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、窗口、渲染”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `appendIncrementalChatMessages(container, conv, windowState)`、`renderChatMessageWindow(container, conv, allMessages, windowState)`、`buildStreamingMessageHtml(conv)`、`wireLoadEarlierMessagesButton(conv, container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
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

// 按键（会话 ID + 消息稳定 ID）对现有行做最小改动：未变化的行保留原节点，只重建真正变化的行。
function renderChatMessageWindow(container, conv, allMessages, windowState) {
    var registry = getChatMessageRenderRegistry(conv);
    pruneDetachedChatMessageRows(container, registry);

    var scrollAnchor = captureChatMessageScrollAnchor(container);

    var messages = conv.messages || [];
    // 可见窗口过滤了 system 消息，windowState.startIdx + i 不是会话里的真实下标，
    // 动作/开场按钮/签名都改用稳定 ID 映射回原始下标。
    var indexById = new Map();
    for (var m = 0; m < messages.length; m++) {
        if (messages[m] && messages[m].id != null) indexById.set(messages[m].id, m);
    }

    var conversationStamp = getChatMessageConversationStamp(conv);
    var firstNonSystemIndex = findFirstNonSystemMessageIndex(conv);
    var desiredRows = [];
    var mvuDisplayCache = getChatMessageRenderMvuCache(conv, registry, windowState.visibleMessages);

    for (var i = 0; i < windowState.visibleMessages.length; i++) {
        var msg = windowState.visibleMessages[i];
        var messageIndex = indexById.has(msg.id) ? indexById.get(msg.id) : messages.indexOf(msg);
        var contentStamp = getChatMessageContentStamp(msg, conv, mvuDisplayCache);
        var entry = registry.rows.get(msg.id);
        var signature = getChatMessageRowSignature(msg, conv, messageIndex === firstNonSystemIndex, conversationStamp);
        var node = entry ? entry.node : null;
        // 每行只按自己的内容指纹判断：普通正文编辑、前部删除、窗口滑动、加载更早都不会牵动无关行；
        // 模板行读取的 MVU 变量变化会体现在它自己的内容指纹里，从而重建受影响的后续行。
        if (!node || !entry || entry.signature !== signature || entry.contentStamp !== contentStamp) {
            node = createChatMessageElement(msg, conv);
            registry.rows.set(msg.id, { node: node, signature: signature, contentStamp: contentStamp, index: messageIndex });
        } else if (entry.index !== messageIndex) {
            updateRenderedChatMessageActionIndexes(node, messageIndex);
            entry.index = messageIndex;
        }
        updateRenderedChatMessageActions(node, msg, conv);
        desiredRows.push(node);
    }

    pruneUndesiredChatMessageRows(registry, desiredRows);

    var children = buildChatMessageWindowChildren(container, conv, windowState, desiredRows);
    syncKeyedElementChildren(container, children);
    conv._lastRenderedVisibleCount = windowState.currentVisibleCount;
    restoreChatMessageScrollAnchor(container, registry, scrollAnchor);
}

// 只有窗口里真的存在 MVU/模板消息时才读取 MVU 上下文戳；未变化时复用上次的逐行数据。
function getChatMessageRenderMvuCache(conv, registry, visibleMessages) {
    var usesMvu = false;
    for (var i = 0; i < visibleMessages.length; i++) {
        if (chatMessageUsesMvuDisplay(visibleMessages[i])) { usesMvu = true; break; }
    }
    if (!usesMvu || typeof getMvuContextStamp !== 'function') {
        registry.mvuStamp = null;
        registry.mvuDisplay = null;
        return null;
    }
    var stamp = getMvuContextStamp(conv);
    if (registry.mvuStamp !== stamp || !(registry.mvuDisplay instanceof Map)) {
        registry.mvuStamp = stamp;
        registry.mvuDisplay = new Map();
    }
    return registry.mvuDisplay;
}

function updateRenderedChatMessageActions(node, msg, conv) {
    updateRenderedChatMessageFavoriteState(node, msg, conv);
    updateRenderedChatMessageContinueState(node, msg, conv);
}

function buildChatMessageWindowChildren(container, conv, windowState, desiredRows) {
    var children = [];
    var loadUi = typeof syncChatHistoryLoadUi === 'function' ? syncChatHistoryLoadUi(container, conv, windowState) : null;
    if (loadUi) children.push(loadUi);
    for (var i = 0; i < desiredRows.length; i++) children.push(desiredRows[i]);
    var streaming = findChatMessageStreamingNode(container);
    if (!streaming && state.isGenerating) streaming = createChatMessageStreamingNode(conv);
    if (streaming) children.push(streaming);
    return children;
}

function pruneDetachedChatMessageRows(container, registry) {
    registry.rows.forEach(function(entry, id) {
        if (!entry.node || entry.node.parentNode !== container) registry.rows.delete(id);
    });
}

function pruneUndesiredChatMessageRows(registry, desiredRows) {
    var wanted = new Set(desiredRows);
    registry.rows.forEach(function(entry, id) {
        if (!wanted.has(entry.node)) registry.rows.delete(id);
    });
}

function updateRenderedChatMessageActionIndexes(node, messageIndex) {
    node.querySelectorAll('[data-msg-idx]').forEach(function(button) {
        button.setAttribute('data-msg-idx', String(messageIndex));
    });
}

function updateRenderedChatMessageFavoriteState(node, msg, conv) {
    var button = node.querySelector('.msg-action-btn[data-action="favorite"]');
    if (!button) return;
    var pressed = getMessageFavoriteState(msg, conv) ? 'true' : 'false';
    // 先比较再写入，避免重复渲染时产生无意义的 DOM 变更（含文本节点 childList 变更）。
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    var label = pressed === 'true' ? '取消收藏' : '收藏';
    if (button.textContent !== label) button.textContent = label;
}

// 续写按钮只随“是否还是最后一条助手消息”变化，原地增删，避免整行节点被替换。
function updateRenderedChatMessageContinueState(node, msg, conv) {
    var actions = node.querySelector('.msg-actions');
    if (!actions) return;
    var existing = actions.querySelector('.msg-action-btn[data-action="continue"]');
    var shouldShow = !!(msg && msg.role === 'assistant' && typeof canContinueMessage === 'function' && canContinueMessage(conv, msg));
    if (shouldShow === !!existing) return;
    if (existing) {
        existing.remove();
        return;
    }
    var button = document.createElement('button');
    button.className = 'msg-action-btn';
    button.setAttribute('data-action', 'continue');
    button.setAttribute('data-msg-idx', String((conv.messages || []).indexOf(msg)));
    button.textContent = '续写';
    var reference = actions.querySelector('.msg-action-btn[data-action="favorite"]') ||
        actions.querySelector('.msg-action-btn[data-action="greeting"]') ||
        actions.querySelector('.del-btn');
    if (reference) actions.insertBefore(button, reference);
    else actions.appendChild(button);
}

function findChatMessageStreamingNode(container) {
    var children = container.children;
    for (var i = 0; i < children.length; i++) {
        if (children[i].id === 'streamingMsg') return children[i];
    }
    return null;
}

function createChatMessageStreamingNode(conv) {
    var holder = document.createElement('div');
    holder.innerHTML = buildStreamingMessageHtml(conv);
    return holder.firstElementChild;
}

function findChatMessageRowNodeById(container, messageId) {
    var children = container.children;
    for (var i = 0; i < children.length; i++) {
        if (children[i].getAttribute('data-message-id') === messageId) return children[i];
    }
    return null;
}

// 行在容器视口内的顶部坐标：优先用真实矩形，退回内容坐标，保证锚点与滚动用的是同一坐标系。
function measureChatMessageRowTop(node, container) {
    if (node && typeof node.getBoundingClientRect === 'function') return node.getBoundingClientRect().top;
    return (node && node.offsetTop || 0) - (container ? container.scrollTop : 0);
}

// 在任何 DOM 变更之前记录是否接近底部，以及第一条部分可见行的稳定 ID 与视口顶部坐标。
function captureChatMessageScrollAnchor(container) {
    var nearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 150;
    var containerTop = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect().top : 0;
    var children = container.children;
    var lastId = null;
    var lastTop = 0;
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var id = child.getAttribute('data-message-id');
        if (!id) continue;
        var top = measureChatMessageRowTop(child, container);
        var bottom = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect().bottom : top + (child.offsetHeight || 0);
        lastId = id;
        lastTop = top;
        if (bottom > containerTop) return { nearBottom: nearBottom, messageId: id, top: top };
    }
    return { nearBottom: nearBottom, messageId: lastId, top: lastTop };
}

// 用同一锚点行更新前后的视口坐标差补偿滚动量，保持已读位置不动。
function restoreChatMessageScrollAnchor(container, registry, anchor) {
    if (!anchor) return;
    if (anchor.nearBottom) {
        container.scrollTop = container.scrollHeight;
        return;
    }
    if (!anchor.messageId) return;
    var entry = registry.rows.get(anchor.messageId);
    var node = entry && entry.node && entry.node.parentNode === container ? entry.node : findChatMessageRowNodeById(container, anchor.messageId);
    if (!node) return;
    container.scrollTop += measureChatMessageRowTop(node, container) - anchor.top;
}

// 只做必要的移动：删除多余子节点，再按目标顺序把位置不对的节点插入到正确位置。
function syncKeyedElementChildren(container, desired) {
    var desiredSet = new Set(desired);
    var current = Array.prototype.slice.call(container.children);
    for (var i = 0; i < current.length; i++) {
        if (!desiredSet.has(current[i])) container.removeChild(current[i]);
    }
    var anchor = null;
    for (var j = desired.length - 1; j >= 0; j--) {
        var node = desired[j];
        if (node.parentNode !== container || node.nextSibling !== anchor) container.insertBefore(node, anchor);
        anchor = node;
    }
}

function buildStreamingMessageHtml(conv) {
    var streamingSpeaker = getCurrentGeneratingSpeakerName(conv);
    var streamingCharacter = isGroupChat(conv) ? getCurrentSpeakerCharacter(conv) : conv.character;
    return '<div id="streamingMsg" class="msg-assistant flex justify-start">' +
        '<div class="max-w-[80%]">' +
        renderAssistantSenderHtml(streamingSpeaker, streamingCharacter) +
        '<div id="streamingCot"></div>' +
        '<div class="msg-bubble typing-cursor" id="streamingContent"></div>' +
        '</div></div>';
}

function wireLoadEarlierMessagesButton(conv, container) {
    bindLoadEarlierMessagesButton(getLoadEarlierMessagesButtonFromDocument(), conv, container);
}
