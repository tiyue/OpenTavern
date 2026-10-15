// ==================== Image Generation Runtime State ====================
var imageGenerationIsGenerating = false;
var imageGenerationAbortController = null;

function setImageGenerationActive(active, controller) {
    imageGenerationIsGenerating = !!active;
    imageGenerationAbortController = imageGenerationIsGenerating ? (controller || null) : null;

    if (dom.imageGenerationBtn) {
        dom.imageGenerationBtn.classList.toggle('animate-pulse', imageGenerationIsGenerating);
    }
    if (dom.imageGenerationSubmitBtn) {
        dom.imageGenerationSubmitBtn.disabled = imageGenerationIsGenerating;
        dom.imageGenerationSubmitBtn.textContent = imageGenerationIsGenerating ? '生成中…' : '生成图片';
    }
    if (dom.imageGenerationPrompt) dom.imageGenerationPrompt.disabled = imageGenerationIsGenerating;
    if (dom.imageGenerationPanelSize) dom.imageGenerationPanelSize.disabled = imageGenerationIsGenerating;
    if (dom.imageGenerationPanelPromptExtend) dom.imageGenerationPanelPromptExtend.disabled = imageGenerationIsGenerating;
    if (dom.imageGenerationCloseBtn) dom.imageGenerationCloseBtn.disabled = imageGenerationIsGenerating;
    if (dom.imageGenerationCancelBtn) dom.imageGenerationCancelBtn.textContent = imageGenerationIsGenerating ? '停止' : '取消';
    updateInputState();
}

function cancelImageGenerationRequest() {
    if (imageGenerationAbortController) imageGenerationAbortController.abort();
}

function setImageGenerationPanelStatus(message, tone) {
    if (!dom.imageGenerationStatus) return;
    dom.imageGenerationStatus.textContent = String(message || '');
    var colors = { error: '#fca5a5', success: '#86efac', working: '#fbbf24' };
    dom.imageGenerationStatus.style.color = colors[tone] || '';
}
