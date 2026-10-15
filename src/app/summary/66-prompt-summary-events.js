/**
 * 新手导读（文件：66-prompt-summary-events.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“提示词、总结、事件”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `bindPromptAndSummaryWorkflowEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
// ==================== Prompt Viewer / Summary Workflow Events ====================
function bindPromptAndSummaryWorkflowEvents() {
    bindPromptViewerEvents();
    bindSummaryManagerWorkflowEvents();
}
