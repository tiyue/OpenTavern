/**
 * 新手导读（文件：54-summarization-runtime.js）
 *
 * 负责什么：这是“自动总结流程”中的“总结、运行流程”部分。
 * 在程序中的位置：它判断何时需要总结、选择消息范围，并把结果写入会话。
 * 从哪里开始看：主要从 `performSummarization(subset, startIdx, endIdx, onDone)`、`triggerSummarization(turns)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：coveredStart 与 coveredEnd 是历史下标，错误更新会造成消息被重复总结或漏发。
 */
// 自动总结运行时：调用总结模型、保存结果并更新会话摘要覆盖范围。
/**
 * 为指定的一段历史消息生成总结，并记录这份总结覆盖的原始消息范围。
 *
 * @param {Array} subset - 本次交给总结模型的消息副本，至少包含两条消息。
 * @param {number} startIdx - subset 第一条消息在普通历史中的下标。
 * @param {number} endIdx - subset 最后一条消息在普通历史中的下标。
 * @param {Function} onDone - 完成回调；成功传 null，失败传 Error。
 *
 * 原始消息不会被删除：聊天界面继续显示完整历史；只有下次构建模型提示词时，已覆盖的旧消息
 * 才被总结文本替代。这样同时满足“用户能回看”和“模型上下文不过长”两个目标。
 */
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
