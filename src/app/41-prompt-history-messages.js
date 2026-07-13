/**
 * 新手导读（文件：41-prompt-history-messages.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、历史记录、消息”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `getMaxPromptSummaryCoveredEnd(summaries)`、`getRegularPromptMessages(conv, maxMsgs)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// 历史消息裁剪：按摘要覆盖范围与上下文限制选择需要发送的聊天记录。
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
        return m.role !== 'system';
    });
    var lastCovered = getMaxPromptSummaryCoveredEnd((conv && conv.summaries) || []);
    // coveredEnd 使用全部非 system 消息的下标，因此必须先裁剪，再排除空正文和二段消息。
    if (lastCovered >= 0 && lastCovered < regularMsgs.length - 1) {
        regularMsgs = regularMsgs.slice(lastCovered + 1);
    }

    regularMsgs = regularMsgs.filter(function(m) {
        return m.stage !== 'second' && String(m.content || '').trim();
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
