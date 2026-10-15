/**
 * 新手导读（文件：41-prompt-history-messages.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、历史记录、消息”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `getPromptSummaryCoverageRanges(summaries, messageCount)`、`getRegularPromptMessages(conv, maxMsgs)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// 历史消息裁剪：按摘要覆盖范围与上下文限制选择需要发送的聊天记录。
function getPromptSummaryCoverageRanges(summaries, messageCount, regularMessages) {
    var ranges = [];
    (summaries || []).forEach(function(summary) {
        var range = getSummarySourceRange(summary, regularMessages || []);
        if (!range) return;
        var start = range.start;
        var end = range.end;
        if (!Number.isInteger(start) || !Number.isInteger(end)) return;
        if (start < 0 || end < start || end >= messageCount) return;
        ranges.push({ start: start, end: end });
    });
    return ranges;
}

function isPromptMessageCoveredBySummary(messageIndex, ranges) {
    return ranges.some(function(range) {
        return messageIndex >= range.start && messageIndex <= range.end;
    });
}

function getRegularPromptMessages(conv, maxMsgs) {
    var regularMsgs = (conv && Array.isArray(conv.messages) ? conv.messages : []).filter(function(m) {
        return m.role !== 'system';
    });
    var coverageRanges = getPromptSummaryCoverageRanges((conv && conv.summaries) || [], regularMsgs.length, regularMsgs);
    // 总结范围使用全部非 system 消息的下标。只移除确实被总结覆盖的消息，
    // 不能仅按最大的 coveredEnd 裁掉前缀，否则手动总结最近范围时会丢失更早的未总结历史。
    regularMsgs = regularMsgs.filter(function(m, index) {
        return !isPromptMessageCoveredBySummary(index, coverageRanges);
    });

    regularMsgs = regularMsgs.filter(function(m) {
        return m.stage !== 'second' && String(m.content || '').trim();
    }).map(function(m) {
        var content = m.role === 'assistant' ? isolatePrimaryStageContent(m.content) : m.content;
        var message = { role: m.role, content: content };
        Object.defineProperty(message, '__promptSource', {
            value: {
                message: m,
                id: m.id,
                revision: typeof getMessageRevision === 'function' ? getMessageRevision(m) : JSON.stringify(m)
            }
        });
        return message;
    }).filter(function(m) {
        return String(m.content || '').trim();
    });

    if (regularMsgs.length > maxMsgs) {
        regularMsgs = regularMsgs.slice(regularMsgs.length - maxMsgs);
    }

    return regularMsgs;
}
