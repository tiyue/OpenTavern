function getMaxPromptSummaryCoveredEnd(summaries) {
    var lastCovered = -1;
    if (summaries && summaries.length > 0) {
        summaries.forEach(function(s) {
            if (typeof s.coveredEnd === 'number' && s.coveredEnd > lastCovered) lastCovered = s.coveredEnd;
        });
    }
    return lastCovered;
}

function getRegularPromptMessages(conv, maxMsgs) {
    var regularMsgs = (conv && Array.isArray(conv.messages) ? conv.messages : []).filter(function(m) {
        return m.role !== 'system' && String(m.content || '').trim();
    });
    var lastCovered = getMaxPromptSummaryCoveredEnd((conv && conv.summaries) || []);
    if (lastCovered >= 0 && lastCovered < regularMsgs.length - 1) {
        regularMsgs = regularMsgs.slice(lastCovered + 1);
    }

    regularMsgs = regularMsgs.filter(function(m) {
        return m.stage !== 'second';
    }).map(function(m) {
        var content = m.role === 'assistant' ? isolatePrimaryStageContent(m.content) : m.content;
        return { role: m.role, content: content };
    }).filter(function(m) {
        return String(m.content || '').trim();
    });

    if (regularMsgs.length > maxMsgs) {
        regularMsgs = regularMsgs.slice(regularMsgs.length - maxMsgs);
    }

    return regularMsgs;
}
