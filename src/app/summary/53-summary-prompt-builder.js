/**
 * 新手导读（文件：53-summary-prompt-builder.js）
 *
 * 负责什么：这是“总结服务”中的“总结、提示词、构建器”部分。
 * 在程序中的位置：它构建总结提示词并调用独立或主模型 API 生成会话总结。
 * 从哪里开始看：主要从 `buildSummaryPromptConfig(settings)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：总结长度限制和语言设置会影响上下文占用，不要绕过统一的限制计算。
 */
// ==================== Summary Prompt Builder ====================
function buildSummaryPromptConfig(settings) {
    var lang = settings.lang || 'zh-CN';
    var summaryPrompt = String(settings.summaryPrompt || '').trim() || getDefaultSummaryPrompt(lang);
    if (!String(settings.summaryPrompt || '').trim() && settings.summaryPromptMode === 'relaxed') {
        summaryPrompt += '\n只整理对话中已经发生的事实、人物关系和未解决线索。不要续写剧情；允许用简洁要点保留不确定信息。';
    }
    var maxWords = parseInt(settings.summaryMaxWords, 10) || 0;

    if (maxWords > 0) {
        summaryPrompt += getSummaryWordLimitSuffix(lang, maxWords);
    }

    return {
        prompt: summaryPrompt,
        maxWords: maxWords,
        maxTokens: getSummaryMaxTokens(maxWords)
    };
}
