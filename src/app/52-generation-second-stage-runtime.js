/**
 * 新手导读（文件：52-generation-second-stage-runtime.js）
 *
 * 负责什么：这是“回复生成主流程”中的“内容生成、第二阶段、运行流程”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `runSecondStageGeneration(firstStageMessage, onDone)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
// ==================== Second Stage Generation Runtime ====================
/**
 * 在正文生成结束后，单独运行“第二阶段”模型请求来产生可选事项。
 *
 * @param {Object} firstStageMessage - 刚保存的正文消息；其 id 会成为二段消息的 parentId。
 * @param {Function} onDone - 整个流程结束时调用；成功传 null，失败传 Error。
 *
 * 二段请求拥有自己的提示词、采样参数、流式 DOM 标识和最终消息记录。这样用户看到的选项
 * 不会追加到正文气泡，也不会在下一轮作为普通历史重复发送。若使用 WebLLM，必须先确保
 * 本地引擎准备完毕；初始化失败会退回远程 API 配置并把错误交给调用者。
 */
function runSecondStageGeneration(firstStageMessage, onDone) {
    var conv = getActiveConv();
    if (!conv || !firstStageMessage) {
        if (onDone) onDone();
        return;
    }
    ensureMessageIdentity(firstStageMessage, 'main');

    // 真正的请求步骤被包成内部函数，远程 API 可直接执行，本地模型则在引擎就绪后执行。
    function startSecondStage() {
        removeGenerationStreamingBubble('main');
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
                updateStreamingBubble(fullContent, conv, t('two_stage_sender') || '第二阶段', fullCot, 'second');
            },
            function onComplete(fullContent, fullCot) {
                removeGenerationStreamingBubble('second');
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
                removeGenerationStreamingBubble('second');
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
