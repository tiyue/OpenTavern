/**
 * 新手导读（文件：54-summarization-auto-selection.js）
 *
 * 负责什么：这是“自动总结流程”中的“总结、自动处理、选择”部分。
 * 在程序中的位置：它判断何时需要总结、选择消息范围，并把结果写入会话。
 * 从哪里开始看：主要从 `getAutoSummaryRegularMessages(conv)`、`shouldAutoSummarizeByBacklog(currentVisibleCount, targetKeep, minSummarizeBatch)`、`shouldAutoSummarizeByVisibleCount(actualVisibleCount, threshold)`、`buildAutoSummarySelection(conv, settings, getFallbackVisibleCount)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：coveredStart 与 coveredEnd 是历史下标，错误更新会造成消息被重复总结或漏发。
 */
// ==================== Auto Summarization Selection Helpers ====================
function getAutoSummaryRegularMessages(conv) {
    return conv && Array.isArray(conv.messages)
        ? conv.messages.filter(function(m) { return m.role !== 'system'; })
        : [];
}

function shouldAutoSummarizeByBacklog(currentVisibleCount, targetKeep, minSummarizeBatch) {
    return currentVisibleCount > targetKeep + minSummarizeBatch;
}

function shouldAutoSummarizeByVisibleCount(actualVisibleCount, threshold) {
    return typeof actualVisibleCount === 'number' && actualVisibleCount >= threshold;
}

function buildAutoSummarySelection(conv, settings, getFallbackVisibleCount) {
    var allRegular = getAutoSummaryRegularMessages(conv);
    if (allRegular.length < 6) return null;

    var threshold = getAutoSummaryThreshold(settings);
    var lastCovered = getMaxSummaryCoveredEnd(conv.summaries || []);
    var currentVisibleCount = Math.max(0, allRegular.length - lastCovered - 1);
    var targetKeep = getAutoSummaryTargetKeep(threshold);
    var minSummarizeBatch = getAutoSummaryMinBatch(threshold);

    var shouldSummarize = shouldAutoSummarizeByBacklog(
        currentVisibleCount,
        targetKeep,
        minSummarizeBatch
    );

    if (!shouldSummarize && typeof getFallbackVisibleCount === 'function') {
        shouldSummarize = shouldAutoSummarizeByVisibleCount(getFallbackVisibleCount(), threshold);
    }

    if (!shouldSummarize) return null;

    var newCoveredEnd = allRegular.length - targetKeep - 1;
    if (newCoveredEnd <= lastCovered) return null;

    var toSummarize = allRegular.slice(lastCovered + 1, newCoveredEnd + 1);
    if (toSummarize.length < 5) return null;

    return {
        subset: toSummarize,
        startIdx: lastCovered + 1,
        endIdx: newCoveredEnd,
        threshold: threshold,
        targetKeep: targetKeep,
        minSummarizeBatch: minSummarizeBatch,
        currentVisibleCount: currentVisibleCount
    };
}
