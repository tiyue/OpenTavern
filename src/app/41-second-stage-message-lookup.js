/**
 * 新手导读（文件：41-second-stage-message-lookup.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“第二阶段、消息、查找”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `findLinkedSecondStageMessage(conv, parentMsg)`、`findPreviousMainAssistantMessage(conv, currentMainMsg)`、`findLatestUserMessageBefore(conv, targetMsg)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// 二段消息关联查询：定位主回复对应的二段输出及相邻上下文消息。
function findLinkedSecondStageMessage(conv, parentMsg) {
    if (!conv || !parentMsg || !Array.isArray(conv.messages)) return null;
    ensureMessageIdentity(parentMsg, 'main');
    for (var i = conv.messages.length - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage === 'second' && m.parentId === parentMsg.id) {
            return m;
        }
    }
    return null;
}

function findPreviousMainAssistantMessage(conv, currentMainMsg) {
    if (!conv || !currentMainMsg || !Array.isArray(conv.messages)) return null;
    var currentIdx = conv.messages.indexOf(currentMainMsg);
    if (currentIdx < 0) currentIdx = conv.messages.length;
    for (var i = currentIdx - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage !== 'second') {
            return m;
        }
    }
    return null;
}

function findLatestUserMessageBefore(conv, targetMsg) {
    if (!conv || !targetMsg || !Array.isArray(conv.messages)) return null;
    var targetIdx = conv.messages.indexOf(targetMsg);
    if (targetIdx < 0) targetIdx = conv.messages.length;
    for (var i = targetIdx - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'user') return m;
    }
    return null;
}
