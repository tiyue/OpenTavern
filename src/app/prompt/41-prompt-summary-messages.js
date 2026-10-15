/**
 * 新手导读（文件：41-prompt-summary-messages.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、总结、消息”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `getPromptSummaryHeader(lang)`、`buildPromptSummaryMessage(summaries, lang)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// 摘要提示词消息：把会话摘要转换为适合注入模型上下文的消息块。
function getPromptSummaryHeader(lang) {
    if (lang === 'zh-TW') {
        return '[以下是先前對話的自動摘要，供上下文參考]\n';
    }
    if (lang === 'en') {
        return '[Automatic summary of previous conversation for context]\n';
    }
    return '[以下是先前对话的自动摘要，供上下文参考]\n';
}

function buildPromptSummaryMessage(summaries, lang) {
    if (!summaries || summaries.length === 0) return null;
    var summaryText = summaries.map(function(s) { return s.text; }).join('\n---\n');
    return {
        role: 'system',
        content: getPromptSummaryHeader(lang) + summaryText
    };
}
