/**
 * 新手导读（文件：54-summarization-runtime.js）
 *
 * 负责什么：这是“自动总结流程”中的“总结、运行流程”部分。
 * 在程序中的位置：它判断何时需要总结、选择消息范围，并把结果写入会话。
 * 从哪里开始看：主要从 `performSummarization(subset, startIdx, endIdx, onDone, conversation)`、`triggerSummarization(turns)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：来源 ID 与修订必须在请求及可靠保存期间保持有效，旧数字范围不能证明覆盖。
 */
// 自动总结运行时：调用总结模型、保存结果并更新会话摘要覆盖范围。
var summaryInFlightConversations = new Set();

function getSummaryInProgressError() {
    return new Error(t('summary_generating') || 'Summary is already in progress.');
}

/**
 * 为指定的一段历史消息生成总结，并记录这份总结覆盖的原始消息范围。
 *
 * @param {Array} subset - 本次交给总结模型的消息副本，至少包含两条消息。
 * @param {number} startIdx - subset 第一条消息在普通历史中的下标。
 * @param {number} endIdx - subset 最后一条消息在普通历史中的下标。
 * @param {Function} onDone - 完成回调；成功传 null，失败传 Error。
 * @param {Object} conversation - 可选的发起会话，未提供时使用当前会话。
 *
 * 原始消息不会被删除：聊天界面继续显示完整历史；只有下次构建模型提示词时，已覆盖的旧消息
 * 才被总结文本替代。这样同时满足“用户能回看”和“模型上下文不过长”两个目标。
 */
function performSummarization(subset, startIdx, endIdx, onDone, conversation) {
    var conv = conversation === undefined ? getActiveConv() : conversation;
    var regularMsgs = getSummaryRegularMessages(conv);
    if (!isLiveConversation(conv) || typeof conv.id !== 'string' || !conv.id ||
        !Array.isArray(subset) || !Number.isInteger(startIdx) || !Number.isInteger(endIdx) ||
        startIdx < 0 || endIdx < startIdx || endIdx >= regularMsgs.length) {
        if (onDone) onDone(new Error('Invalid summary source range.'));
        return false;
    }
    normalizeConversationMessageIdentity(conv);
    var conversationId = conv.id;
    if (summaryInFlightConversations.has(conversationId)) {
        if (onDone) onDone(getSummaryInProgressError());
        return false;
    }

    var sources = regularMsgs.slice(startIdx, endIdx + 1).filter(isSummarySourceMessage);
    var supplied = subset.filter(function(msg) { return msg && msg.role !== 'system' && isSummarySourceMessage(msg); });
    if (sources.length < 2 || sources.length !== supplied.length || sources.some(function(msg, index) {
        return typeof msg.id !== 'string' || !msg.id ||
            (typeof supplied[index].id === 'string' && supplied[index].id && msg.id !== supplied[index].id) ||
            getMessageRevision(msg) !== getMessageRevision(supplied[index]);
    })) {
        if (onDone) onDone(new Error('Invalid summary source messages.'));
        return false;
    }

    var sourceMessages = captureSummarySources(sources);
    if (!getSummarySourceRange({ summaryVersion: 2, sourceMessages: sourceMessages, text: 'pending' }, regularMsgs)) {
        if (onDone) onDone(new Error('Invalid summary source messages.'));
        return false;
    }
    var inputMessages = sources.map(function(msg) { return { role: msg.role, content: String(msg.content || '') }; });
    var finished = false;
    var responseHandled = false;
    function finish(error) {
        if (finished) return;
        finished = true;
        summaryInFlightConversations.delete(conversationId);
        if (onDone) onDone(error || null);
    }

    summaryInFlightConversations.add(conversationId);
    try {
        generateSummary(inputMessages, async function(err, summaryText) {
            if (responseHandled || finished) return;
            responseHandled = true;
            if (err || typeof summaryText !== 'string' || !summaryText.trim()) {
                finish(new Error('Summary request failed: ' + (err ? (err.message || err) : 'API returned empty content.')));
                return;
            }

            try {
                var summary = {
                    id: makeId(),
                    text: summaryText,
                    summaryVersion: 2,
                    sourceMessages: sourceMessages,
                    coveredStart: startIdx,
                    coveredEnd: endIdx,
                    created: Date.now()
                };
                if (!isLiveConversation(conv) || conv.id !== conversationId ||
                    !getSummarySourceRange(summary, getSummaryRegularMessages(conv))) {
                    finish(new Error('Summary source messages changed or the conversation was removed.'));
                    return;
                }
                if (conv._messageCommitInProgress) {
                    finish(new Error('Summary save failed: the conversation has another save in progress.'));
                    return;
                }

                var previousUpdated = conv.updated;
                var summaryUpdated = Date.now();
                var candidate = Object.assign({}, conv, { summaries: (conv.summaries || []).concat(summary), updated: summaryUpdated });
                refreshSummaryValidity(candidate);
                function commit(target, validateOnly) {
                    if (!getSummarySourceRange(summary, getSummaryRegularMessages(target))) return false;
                    if (validateOnly) return true;
                    if (!(target.summaries || []).some(function(item) { return item.id === summary.id; })) {
                        target.summaries = (target.summaries || []).concat(summary);
                    }
                    if (target.updated === previousUpdated) target.updated = summaryUpdated;
                    refreshSummaryValidity(target);
                    return true;
                }
                await persistConversationMutation(conv, function(target) {
                    if (Array.isArray(target.summaries)) {
                        target.summaries = target.summaries.filter(function(item) { return item.id !== summary.id; });
                    }
                    if (target.updated === summaryUpdated) target.updated = previousUpdated;
                    refreshSummaryValidity(target);
                }, candidate, commit);

                if (!isLiveConversation(conv) || conv.id !== conversationId ||
                    !getSummarySourceRange(summary, getSummaryRegularMessages(conv))) {
                    refreshSummaryValidity(conv);
                    finish(new Error('Summary source messages changed or the conversation was removed.'));
                    return;
                }

                // 原始聊天始终保留，仅有效摘要参与提示词覆盖。
                conv._lastRenderedVisibleCount = 0;
                conv._wiCache = null;
                if (conv._wiTimedEffects) conv._wiTimedEffects = {};
                finish(null);
            } catch (error) {
                finish(new Error('Summary save failed: ' + (error.message || error)));
            }
        });
    } catch (error) {
        finish(new Error('Summary request failed: ' + (error.message || error)));
        return false;
    }
    return true;
}

function triggerSummarization(turns) {
    var conv = getActiveConv();
    if (!conv) return;
    var regularMsgs = getSummaryRegularMessages(conv);
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
    }, conv);
}
