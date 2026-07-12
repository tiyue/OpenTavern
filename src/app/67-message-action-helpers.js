/**
 * 新手导读（文件：67-message-action-helpers.js）
 *
 * 负责什么：这是“消息操作”中的“消息、操作、辅助函数”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `resetConversationAfterMessageMutation(conv)`、`persistAndRenderMessageMutation(conv, renderConversationList)`、`deleteUserMessageWithReplies(conv, actualIdx)`、`deleteAssistantMessageAt(conv, actualIdx)`、`findSecondStageParentMessage(conv, msg)`、`removeSecondStageMessageForRegeneration(conv, actualIdx)`，以及另外 1 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
// ==================== Message Action Helpers ====================
function resetConversationAfterMessageMutation(conv) {
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
}

function persistAndRenderMessageMutation(conv, renderConversationList) {
    resetConversationAfterMessageMutation(conv);
    persistState();
    renderMessagesOnly();
    if (renderConversationList) renderConversationListOnly();
}

function deleteUserMessageWithReplies(conv, actualIdx) {
    var deleteCount = 1;
    var scanIdx = actualIdx + 1;
    while (scanIdx < conv.messages.length && conv.messages[scanIdx].role === 'assistant') {
        deleteCount++;
        scanIdx++;
        if (deleteCount >= 3) break;
    }
    conv.messages.splice(actualIdx, deleteCount);
}

function deleteAssistantMessageAt(conv, actualIdx) {
    var msg = conv.messages[actualIdx];
    if (!msg) return;
    if (msg.stage !== 'second') {
        removeLinkedSecondStageMessages(conv, msg);
        actualIdx = conv.messages.indexOf(msg);
    }
    conv.messages.splice(actualIdx, 1);
}

function findSecondStageParentMessage(conv, msg) {
    return conv.messages.find(function(m) {
        return m && m.id && m.id === msg.parentId;
    });
}

function removeSecondStageMessageForRegeneration(conv, actualIdx) {
    var msg = conv.messages[actualIdx];
    if (!msg) return null;
    var parent = findSecondStageParentMessage(conv, msg);
    conv.messages.splice(actualIdx, 1);
    persistAndRenderMessageMutation(conv, false);
    return parent;
}

function removePrimaryAssistantMessageForRegeneration(conv, msg) {
    removeLinkedSecondStageMessages(conv, msg);
    var actualIdx = conv.messages.indexOf(msg);
    if (actualIdx >= 0) conv.messages.splice(actualIdx, 1);
    persistAndRenderMessageMutation(conv, true);
}
