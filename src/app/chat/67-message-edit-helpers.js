/**
 * 新手导读（文件：67-message-edit-helpers.js）
 *
 * 负责什么：这是“消息操作”中的“消息、编辑、辅助函数”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `findEditableMessageBubble(actualIdx, triggerBtn)`、`createMessageEditTextarea(originalContent, originalBubbleWidth)`、`autoResizeMessageEditTextarea(ta)`、`applyMessageEditContent(conv, actualIdx, originalContent, editedContent)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
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
    if (conv._messageCommitInProgress) return 'unchanged';
    var msg = conv.messages[actualIdx];
    if (!msg) return 'missing';

    var newVal = String(editedContent || '').trim();
    if (newVal === originalContent) return 'unchanged';

    var parent = msg.stage === 'second' ? conv.messages.find(function(m) { return m.id === msg.parentId && m.stage !== 'second'; }) : msg;
    var prepared = parent && parent.role === 'assistant' && (getResponseVersions(parent).length || parent.mvuManualData) ? prepareResponseVersions(conv, parent) : null;

    msg.content = newVal;
    if (typeof clearMvuManualOverride === 'function') clearMvuManualOverride(msg);
    msg.revision = getMessageRevision(msg);
    if (msg.role === 'assistant' && msg.stage !== 'second') {
        removeLinkedSecondStageMessages(conv, msg);
    }
    if (prepared) {
        var version = captureResponseVersion(conv, parent);
        parent.responseVersions = prepared.versions.concat(version);
        parent.selectedResponseVersionId = version.id;
    }
    refreshSummaryValidity(conv);
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    return 'changed';
}
