/**
 * 新手导读（文件：67-message-regeneration-runtime.js）
 *
 * 负责什么：这是“消息操作”中的“消息、重新生成、运行流程”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `prepareGroupSpeakerForRegeneration(conv, lastMsg)`、`handlePrimaryRegenerationError(err)`、`startPrimaryMessageRegeneration(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
// ==================== Message Regeneration Runtime ====================
function prepareGroupSpeakerForRegeneration(conv, lastMsg) {
    if (!isGroupChat(conv)) return;
    var mentioned = parseGroupMention(lastMsg.content || '', conv);
    conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
}

function handlePrimaryRegenerationError(err) {
    var streamingEl = document.getElementById('streamingMsg');
    if (streamingEl) streamingEl.remove();
    state.isGenerating = false;
    appStore.notify('isGenerating');
    renderMessagesOnly();
    alert('Error: ' + (err.message || err));
}

function startPrimaryMessageRegeneration(conv) {
    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            handlePrimaryAssistantComplete,
            handlePrimaryRegenerationError
        );
        updateInputState();
    };

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(start).catch(handlePrimaryRegenerationError);
    } else {
        start();
    }
}

