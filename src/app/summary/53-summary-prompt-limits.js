/**
 * 新手导读（文件：53-summary-prompt-limits.js）
 *
 * 负责什么：这是“总结服务”中的“总结、提示词、限制”部分。
 * 在程序中的位置：它构建总结提示词并调用独立或主模型 API 生成会话总结。
 * 从哪里开始看：主要从 `getSummaryWordLimitSuffix(lang, maxWords)`、`getSummaryMaxTokens(maxWords)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：总结长度限制和语言设置会影响上下文占用，不要绕过统一的限制计算。
 */
// ==================== Summary Prompt Limits ====================
function getSummaryWordLimitSuffix(lang, maxWords) {
    if (lang === 'zh-TW') {
        return '\n\n【字數限制】總結內容不得超過' + maxWords + '字，必須嚴格遵守上述5段結構。';
    }
    if (lang === 'en') {
        return '\n\n[Word Limit] Keep the entire summary under ' + maxWords + ' words while strictly following the 5-section structure above.';
    }
    return '\n\n【字数限制】总结内容不得超过' + maxWords + '字，必须严格遵守上述5段结构。';
}

function getSummaryMaxTokens(maxWords) {
    if (maxWords > 0) {
        var budget = Math.max(1536, Math.ceil(maxWords * 1.8) + 256);
        return Math.min(budget, 8192);
    }
    return 6144;
}
