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
