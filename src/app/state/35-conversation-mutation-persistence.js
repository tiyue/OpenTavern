// 生成结果使用可靠写入；失败只回滚目标会话的本次变更，并修正后来捕获的待写快照。
async function persistConversationMutation(conv, rollback, candidate, commit) {
    if (conv._messageCommitInProgress) {
        rollback(conv);
        throw new Error('A conversation save is already in progress.');
    }
    Object.defineProperty(conv, '_messageCommitInProgress', { value: true, writable: true, configurable: true, enumerable: false });
    function validate() {
        if (!isLiveConversation(conv) || (candidate && !commit(conv, true))) throw new Error(t('generation_target_changed'));
    }
    try {
        await persistState(true, {
            throwOnError: true,
            conversationSnapshot: candidate,
            beforePersist: validate,
            onPersistSuccess: function() {
                validate();
                if (!candidate) return;
                if (!commit(conv)) throw new Error(t('generation_target_changed'));
            },
            commitPendingSnapshot: function(snapshot) {
                if (!candidate || !isLiveConversation(conv)) return;
                var savedConv = snapshot.conversations && snapshot.conversations[conv.id];
                if (savedConv) commit(savedConv);
            },
            onPersistError: function() { if (isLiveConversation(conv)) rollback(conv); },
            rollbackPendingSnapshot: function(snapshot, pendingOptions) {
                if (pendingOptions && pendingOptions.conversationSnapshot && pendingOptions.conversationSnapshot.id === conv.id) return;
                if (!snapshot.conversations) return;
                var liveConv = state.conversations[conv.id];
                if (liveConv) snapshot.conversations[conv.id] = clonePersistStateSnapshot(liveConv);
                else delete snapshot.conversations[conv.id];
                snapshot.conversationOrder = getPersistableConversationOrder(snapshot.conversationOrder, snapshot.conversations);
                snapshot.activeConvId = getPersistableActiveConversationId(snapshot.activeConvId, snapshot.conversationOrder, snapshot.conversations);
            }
        });
    } finally {
        delete conv._messageCommitInProgress;
    }
}

// 正文、编辑和删除先在独立候选中计算，保存确认前不改变可见历史或 MVU。
async function persistConversationMessageMutation(conv, mutate, options) {
    options = options || {};
    if (!isLiveConversation(conv) || conv._messageCommitInProgress) throw new Error(t('generation_target_changed'));
    var source = JSON.stringify(conv.messages);
    var mvuSource = typeof getMvuContextStamp === 'function' ? getMvuContextStamp(conv) : null;
    var candidate = Object.assign({}, conv, {
        messages: JSON.parse(source),
        summaries: JSON.parse(JSON.stringify(conv.summaries || [])),
        mvu: conv.mvu ? JSON.parse(JSON.stringify(conv.mvu)) : undefined
    });
    var result = mutate(candidate);
    if (result === false || result === 'unchanged' || result === 'missing') return result;
    normalizeConversationMessageIdentity(candidate);
    refreshSummaryValidity(candidate);
    candidate.updated = Date.now();
    if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(candidate, options);
    function commit(c, validateOnly) {
        if (JSON.stringify(c.messages) !== source || (mvuSource !== null && getMvuContextStamp(c) !== mvuSource) || (options.validate && !options.validate(c))) return false;
        if (validateOnly) return true;
        c.messages = JSON.parse(JSON.stringify(candidate.messages));
        c.summaries = JSON.parse(JSON.stringify(candidate.summaries));
        c.updated = candidate.updated;
        c._wiCache = null;
        c._lastRenderedVisibleCount = 0;
        if (typeof commitMvuCandidate === 'function') commitMvuCandidate(c, candidate);
        return true;
    }
    await persistConversationMutation(conv, function() {}, candidate, commit);
    try { if (typeof pruneCardRuntimeInstances === 'function') pruneCardRuntimeInstances(); }
    catch (error) { reportPersistPostSaveError('card runtime cleanup', error); }
    return result;
}
