function performSummarization(subset, startIdx, endIdx, onDone) {
    var conv = getActiveConv();
    if (!conv || !subset || subset.length < 2) {
        if (onDone) onDone(new Error('Invalid subset'));
        return;
    }

    generateSummary(subset, function(err, summaryText) {
        if (err || !summaryText) {
            if (onDone) onDone(err);
            return;
        }

        conv.summaries.push({
            id: makeId(),
            text: summaryText,
            coveredStart: startIdx,
            coveredEnd: endIdx,
            created: Date.now()
        });
        conv.updated = Date.now();

        // 【重要调整 - 符合用户期望】不再物理删除 conv.messages 中的消息
        // 聊天界面将保留完整历史对话（用户可以一直看到之前的内容）
        // 仅依靠 buildMessagesForAPI 中的 summary 注入 + lastCovered 切片逻辑，
        // 在实际发送给模型的 prompt 中移除已总结的原始消息。
        // 这样既能控制上下文大小，又不会让聊天记录在界面上消失。

        // 只重置增量渲染状态（因为可能插入了新摘要）
        conv._lastRenderedVisibleCount = 0;

        // 清理世界书缓存（因为消息结构虽然没变，但摘要增加了）
        conv._wiCache = null;

        // 保守重置世界书定时效果状态
        if (conv._wiTimedEffects) {
            conv._wiTimedEffects = {};
        }

        persistState();
        if (onDone) onDone(null);
    });
}

function triggerSummarization(turns) {
    var conv = getActiveConv();
    if (!conv) return;
    var regularMsgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    if (regularMsgs.length < 2) return; // need at least 2 messages to summarize

    turns = Math.min(turns, Math.floor(regularMsgs.length / 2));
    if (turns < 1) turns = 1;
    var turnCount = turns * 2; // each turn = user + assistant
    var subset = regularMsgs.slice(-turnCount);
    if (subset.length < 2) return;

    var startIdx = regularMsgs.indexOf(subset[0]);
    var endIdx = regularMsgs.indexOf(subset[subset.length - 1]);

    // 使用新的统一执行函数（会自动完成裁剪）
    // 防御：旧小窗元素可能已被删除（统一走管理器后）
    if (dom.summarizeStatus) {
        dom.summarizeStatus.classList.remove('hidden');
        dom.summarizeStatus.textContent = t('summary_generating');
    }
    if (dom.summarizeConfirmBtn) dom.summarizeConfirmBtn.disabled = true;

    performSummarization(subset, startIdx, endIdx, function(err) {
        if (dom.summarizeStatus) dom.summarizeStatus.classList.add('hidden');
        if (dom.summarizeConfirmBtn) dom.summarizeConfirmBtn.disabled = false;
        if (err) { alert('Summary error: ' + (err.message || err)); return; }
        if (dom.summarizeModal) dom.summarizeModal.classList.add('hidden');
        renderSummaryHistory();
    });
}
