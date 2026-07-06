// ==================== Summary Prompt Builder ====================
function buildSummaryPromptConfig(settings) {
    var lang = settings.lang || 'zh-CN';
    var summaryPrompt = String(settings.summaryPrompt || '').trim() || getDefaultSummaryPrompt(lang);
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
