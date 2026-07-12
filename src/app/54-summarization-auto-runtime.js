/**
 * 新手导读（文件：54-summarization-auto-runtime.js）
 *
 * 负责什么：这是“自动总结流程”中的“总结、自动处理、运行流程”部分。
 * 在程序中的位置：它判断何时需要总结、选择消息范围，并把结果写入会话。
 * 从哪里开始看：主要从 `autoSummarize(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：coveredStart 与 coveredEnd 是历史下标，错误更新会造成消息被重复总结或漏发。
 */
// ==================== Auto Summarization Runtime ====================
function autoSummarize() {
    if (!state.settings.summaryEnabled) return;

    var conv = getActiveConv();
    if (!conv) return;

    var selection = buildAutoSummarySelection(conv, state.settings, getActualVisibleCountForSummary);
    if (!selection) return;

    performSummarization(selection.subset, selection.startIdx, selection.endIdx, function() {
        renderTokenBar();
    });
}
