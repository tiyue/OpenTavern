// ==================== Send Message ====================
function sendMessage() {
    if (state.isGenerating) return;
    var text = dom.messageInput.value.trim();
    if (!text) return;
    var conv = getActiveConv();
    if (!conv) return;

    appendUserMessageToConversation(conv, text);
    prepareGroupSpeakerForUserMessage(conv, text);
    resetMessageComposerInput();
    persistState();
    requestFullRender();

    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            handlePrimaryAssistantComplete,
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('Error: ' + (err.message || err));
            }
        );
        updateInputState();
    };

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId(), function(p) {
            console.log('[WebLLM progress]', Math.round((p.progress || 0) * 100) + '%', p.text || '');
        }).then(start).catch(function(e) {
            state.isGenerating = false;
            appStore.notify('isGenerating');
            renderMessagesOnly();
            var msg = (e && e.message === 'NO_WEBGPU') ? (t('webllm_init_no_webgpu') || '需要 WebGPU 支持') : (e && e.message) || String(e);
            alert('本地模型错误: ' + msg);
            if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            persistState();
        });
    } else {
        start();
    }
}
