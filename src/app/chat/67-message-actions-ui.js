/**
 * 新手导读（文件：67-message-actions-ui.js）
 *
 * 负责什么：这是“消息操作”中的“消息、操作、界面”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `deleteMessage(actualIdx)`、`regenerateMessage(actualIdx)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
// ==================== Message Delete/Regenerate Actions ====================
async function deleteMessage(actualIdx) {
    var conv = getActiveConv();
    if (!conv || conv._messageCommitInProgress) return;

    var msg = conv.messages[actualIdx];
    if (!msg) return;

    try {
        await persistConversationMessageMutation(conv, function(candidate) {
            if (msg.role === 'user') deleteUserMessageWithReplies(candidate, actualIdx);
            else deleteAssistantMessageAt(candidate, actualIdx);
            resetConversationAfterMessageMutation(candidate);
        });
        if (getActiveConv() === conv) renderMessagesOnly();
        renderConversationListOnly();
    } catch (error) { alert(t('generation_save_failed') + ': ' + error.message); }
}

function regenerateMessage(actualIdx) {
    if (state.isGenerating) return;

    var conv = getActiveConv();
    if (!conv || conv._messageCommitInProgress) return;

    var msg = conv.messages[actualIdx];
    if (!msg || msg.role !== 'assistant') return;
    if (typeof isImageAttachmentOnlyMessage === 'function' && isImageAttachmentOnlyMessage(msg)) return;

    if (msg.stage === 'second') {
        var target = getSecondStageRegenerationTarget(conv, actualIdx);
        if (target) runSecondStageGeneration(target.parent, function() { completeGenerationTurn(conv); }, target.message);
        return;
    }

    var later = conv.messages.slice(actualIdx + 1).filter(function(m) { return m.stage !== 'second'; });
    var previous = conv.messages.slice(0, actualIdx).filter(function(m) { return m.role !== 'system' && m.stage !== 'second'; }).pop();
    if (later.length || !previous || previous.role !== 'user') {
        alert(t('regeneration_latest_only'));
        return;
    }
    normalizeConversationMessageIdentity(conv);
    startPrimaryMessageRegeneration(conv, msg);
}
