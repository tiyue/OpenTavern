// ==================== Image Generation Runtime ====================
async function generateImageForCurrentChat() {
    if (imageGenerationIsGenerating || state.isGenerating) return;
    var settings = ensureImageGenerationSettings();
    var conv = getActiveConv();
    if (!conv) return;
    if (!settings.imageGenerationEnabled) {
        alert('请先在设置中启用 Packy GPT Image 图片生成。');
        return;
    }

    var panelOpen = isImageGenerationPanelOpen();
    var userSupplement = panelOpen && dom.imageGenerationPrompt
        ? cleanImageGenerationPromptText(dom.imageGenerationPrompt.value).slice(0, 2000)
        : '';
    var sourceMessage = getLatestPrimaryAssistantImageGenerationMessage(conv);
    var sourceText = sourceMessage ? cleanPrimaryImageGenerationText(sourceMessage.content) : '';
    if (!sourceText) {
        setImageGenerationPanelStatus('没有找到最近一次生成的主回复正文。', 'error');
        return;
    }
    var referenceDescriptor = getImageGenerationReferenceDescriptor(conv, sourceMessage);
    if (!referenceDescriptor.source) {
        setImageGenerationPanelStatus('当前角色卡没有可用图片，无法进行图文生图。', 'error');
        return;
    }

    var controller = new AbortController();
    setImageGenerationPanelStatus('正在并行总结最近正文并处理角色卡图片…', 'working');
    setImageGenerationActive(true, controller);

    try {
        var prepared = await Promise.all([
            generateImageGenerationSceneSummary(sourceText, userSupplement, controller.signal),
            prepareImageGenerationReferenceImage(referenceDescriptor, controller.signal)
        ]);
        var finalPrompt = appendImageGenerationStylePrompt(prepared[0], settings.imageGenerationStylePrompt);
        var request = {
            prompt: finalPrompt,
            referenceImage: prepared[1].dataUrl,
            size: normalizeImageGenerationSize(panelOpen && dom.imageGenerationPanelSize ? dom.imageGenerationPanelSize.value : settings.imageGenerationSize),
            sourceMessageId: String(sourceMessage.id || ''),
            referenceCharacterName: prepared[1].characterName || referenceDescriptor.name
        };
        setImageGenerationPanelStatus('正文已总结，正在发送角色卡图片生成画面…', 'working');
        var result = await requestImageGeneration(request, controller.signal);
        var targetConv = state.conversations && state.conversations[conv.id];
        if (!targetConv) throw new Error('生成完成，但原聊天已不存在。');
        appendImageGenerationMessage(targetConv, createImageGenerationMessage(result, request));
        setImageGenerationPanelStatus('图片已生成并添加到聊天。', 'success');
    } catch (error) {
        if (error && error.name !== 'AbortError') controller.abort();
        setImageGenerationPanelStatus(formatImageGenerationError(error), error && error.name === 'AbortError' ? '' : 'error');
    } finally {
        setImageGenerationActive(false);
    }
}
