// ==================== Second Stage Generation Runtime ====================
function runSecondStageGeneration(firstStageMessage, onDone) {
    var conv = getActiveConv();
    if (!conv || !firstStageMessage) {
        if (onDone) onDone();
        return;
    }
    ensureMessageIdentity(firstStageMessage, 'main');

    function startSecondStage() {
        var messages;
        try {
            messages = buildMessagesForSecondStage(firstStageMessage);
        } catch (err) {
            console.error('buildMessagesForSecondStage failed:', err);
            alert('构建第二阶段提示词时出错：' + (err.message || err));
            if (onDone) onDone(err);
            return;
        }

        streamChatWithMessages(
            messages,
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, t('two_stage_sender') || '第二阶段', fullCot);
            },
            function onComplete(fullContent, fullCot) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                var c = getActiveConv();
                if (c && fullContent) {
                    var speaker = firstStageMessage.speaker || null;
                    finishAssistantMessage(c, fullContent, speaker, 'second', firstStageMessage.id, fullCot);
                }
                state.isGenerating = false;
                appStore.notify('isGenerating');
                if (onDone) onDone(null);
            },
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('第二阶段生成失败：' + (err.message || err));
                if (onDone) onDone(err);
            },
            {
                temperature: typeof state.settings.twoStageTemperature === 'number' ? state.settings.twoStageTemperature : 0.3,
                topP: typeof state.settings.twoStageTopP === 'number' ? state.settings.twoStageTopP : 0.85,
                maxTokens: Math.min(state.settings.maxTokens || 1024, 1024)
            }
        );
    }

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(startSecondStage).catch(function(e) {
            var msg = (e && e.message === 'NO_WEBGPU') ? (t('webllm_init_no_webgpu') || '需要 WebGPU 支持') : (e && e.message) || String(e);
            alert('本地模型错误: ' + msg);
            if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            persistState();
            if (onDone) onDone(e);
        });
    } else {
        startSecondStage();
    }
}
