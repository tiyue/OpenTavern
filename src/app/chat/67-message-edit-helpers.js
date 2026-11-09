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

    if (msg.role === 'user' && typeof selectUserMessageContent === 'function') {
        rememberUserReplyVersions(conv, msg);
        selectUserMessageContent(msg, newVal);
    } else msg.content = newVal;
    if (typeof clearMvuManualOverride === 'function') clearMvuManualOverride(msg);
    if (typeof clearSceneMessageRecord === 'function') clearSceneMessageRecord(msg);
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


function createUserMessageEditBranch(conv, messageId, content) {
    var sourceIndex = conv.messages.findIndex(function(message) { return message.id === messageId && message.role === 'user'; });
    if (sourceIndex < 0) throw new Error(t('generation_target_changed'));
    var candidate = JSON.parse(JSON.stringify(conv));
    Object.keys(candidate).forEach(function(key) { if (key.charAt(0) === '_') delete candidate[key]; });
    delete candidate.streamingDraft;
    var nextUser = candidate.messages.findIndex(function(message, index) { return index > sourceIndex && message.role === 'user'; });
    candidate.messages = candidate.messages.slice(0, nextUser < 0 ? candidate.messages.length : nextUser);
    // A branch keeps this turn's first reply and its options as recoverable versions.
    var main = candidate.messages.find(function(message, index) { return index > sourceIndex && message.role === 'assistant' && message.stage !== 'second' && message.stage !== 'scene'; });
    candidate.messages = candidate.messages.filter(function(message, index) {
        return index <= sourceIndex || (main && (message.id === main.id || message.stage === 'second' && message.parentId === main.id));
    });
    applyMessageEditContent(candidate, sourceIndex, candidate.messages[sourceIndex].content, content);
    candidate.id = makeId();
    candidate.title = String(conv.title || '聊天') + ' · 分支';
    candidate.created = candidate.updated = Date.now();
    candidate.branchOf = { conversationId: conv.id, userMessageId: messageId };
    resetConversationAfterMessageMutation(candidate);
    if (typeof reanchorSceneOpeningRecords === 'function') reanchorSceneOpeningRecords(candidate);
    if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(candidate);
    return candidate;
}

async function persistUserMessageEditBranch(conv, candidate) {
    if (!isLiveConversation(conv) || conv._messageCommitInProgress || state.isGenerating || getActiveConv() !== conv) throw new Error(t('generation_target_changed'));
    var conversations = state.conversations;
    var source = JSON.stringify(conv.messages);
    var mvuSource = typeof getMvuContextStamp === 'function' ? getMvuContextStamp(conv) : null;
    function check() {
        if (state.conversations !== conversations || !isLiveConversation(conv) || getActiveConv() !== conv || state.isGenerating || JSON.stringify(conv.messages) !== source ||
            (mvuSource !== null && getMvuContextStamp(conv) !== mvuSource) || Object.prototype.hasOwnProperty.call(state.conversations, candidate.id)) throw new Error(t('generation_target_changed'));
    }
    function merge(snapshot, live) {
        Object.defineProperty(snapshot.conversations, candidate.id, { value: live ? candidate : JSON.parse(JSON.stringify(candidate)), enumerable: true, configurable: true, writable: true });
        snapshot.conversationOrder = getConversationIdsWithMissingFallback([candidate.id].concat(snapshot.conversationOrder || []), snapshot.conversations);
        if (snapshot.activeConvId === conv.id) snapshot.activeConvId = candidate.id;
        return snapshot;
    }
    Object.defineProperty(conv, '_messageCommitInProgress', { value: true, configurable: true, writable: true });
    try {
        await persistState(true, {
            throwOnError: true,
            transformSnapshot: function(snapshot) { return merge(snapshot, false); },
            beforePersist: check,
            onPersistSuccess: function() {
                check();
                var applied = merge({ conversations: state.conversations, conversationOrder: state.conversationOrder, activeConvId: state.activeConvId }, true);
                state.conversationOrder = applied.conversationOrder;
                state.activeConvId = applied.activeConvId;
            },
            commitPendingSnapshot: function(snapshot) { merge(snapshot, false); },
            rollbackPendingSnapshot: function(snapshot) {
                if (snapshot.conversations && !Object.prototype.hasOwnProperty.call(state.conversations, candidate.id)) delete snapshot.conversations[candidate.id];
                snapshot.conversationOrder = getPersistableConversationOrder(snapshot.conversationOrder, snapshot.conversations);
                snapshot.activeConvId = getPersistableActiveConversationId(snapshot.activeConvId, snapshot.conversationOrder, snapshot.conversations);
            }
        });
    } finally { delete conv._messageCommitInProgress; }
    return candidate;
}

async function saveUserMessageEdit(conv, messageId, revision, content, regenerate) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('用户消息正文必须是非空文本。');
    if (!isLiveConversation(conv) || getActiveConv() !== conv || state.isGenerating || conv._messageCommitInProgress) throw new Error(t('generation_target_changed'));
    var index = conv.messages.findIndex(function(message) { return message.id === messageId && message.role === 'user' && getMessageRevision(message) === revision; });
    if (index < 0) throw new Error(t('generation_target_changed'));
    var hasLaterTurn = conv.messages.slice(index + 1).some(function(message) { return message.role === 'user'; });
    var destination = conv;
    if (regenerate && hasLaterTurn) {
        destination = await persistUserMessageEditBranch(conv, createUserMessageEditBranch(conv, messageId, content.trim()));
    } else {
        await persistConversationMessageMutation(conv, function(candidate) {
            return applyMessageEditContent(candidate, index, conv.messages[index].content, content);
        }, { validate: function() { return !state.isGenerating && getActiveConv() === conv; } });
    }
    if (getActiveConv() === destination) { renderMessagesOnly(); renderTokenBar(); renderConversationListOnly(); }
    if (regenerate && getActiveConv() === destination && !state.isGenerating) startUserMessageRegeneration(destination, messageId);
    return destination;
}
