// ==================== Send Message ====================
function sendMessage() {
    if (state.isGenerating) return;
    var text = dom.messageInput.value.trim();
    if (!text) return;
    var conv = getActiveConv();
    if (!conv) return;

    conv.messages.push({ role: 'user', content: text });
    conv.updated = Date.now();
    conv._wiBudgetWarning = false; // clear previous budget warning on new turn
    if (conv.title === t('title_new_chat_match')) {
        conv.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
    }

    // ===== 群组聊天 @ 指定功能（新气泡 UI，优先使用点击指定的角色，只允许一个） =====
    if (isGroupChat(conv)) {
        let mentioned = null;

        if (pendingGroupMention) {
            // 优先使用左侧气泡指定的角色（点击选择的结果）
            mentioned = pendingGroupMention;
            clearPendingGroupMention(); // 用过即清除
        } else {
            // 兜底：支持用户手动在输入框里输入 @名字 的旧方式
            mentioned = parseGroupMention(text, conv);
        }

        if (mentioned) {
            // 强制本轮由该角色回复
            conv._nextGroupSpeaker = mentioned;
        } else {
            // 没有指定时，按 list_order 自然推进
            conv._nextGroupSpeaker = getNextGroupSpeaker(conv);
        }
    }

    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    clearPendingGroupMention(); // 保险清除（防止异常情况残留）
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
