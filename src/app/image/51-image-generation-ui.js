// ==================== Image Generation Panel ====================
var imageGenerationPreviousFocus = null;

function openImageGenerationPanel() {
    var settings = ensureImageGenerationSettings();
    if (!settings.imageGenerationEnabled) {
        alert('请先在设置中启用 Packy GPT Image 图片生成。');
        return;
    }
    var conv = getActiveConv();
    if (!conv || !dom.imageGenerationPanel) return;

    imageGenerationPreviousFocus = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : dom.imageGenerationBtn;
    if (dom.imageGenerationPrompt) dom.imageGenerationPrompt.value = '';
    if (dom.imageGenerationPanelSize) dom.imageGenerationPanelSize.value = settings.imageGenerationSize;
    if (dom.imageGenerationPanelPromptExtend) dom.imageGenerationPanelPromptExtend.checked = settings.imageGenerationPromptExtend;
    setImageGenerationPanelStatus('');
    dom.imageGenerationPanel.setAttribute('aria-hidden', 'false');
    dom.imageGenerationPanel.classList.remove('hidden');
    setTimeout(function() {
        if (dom.imageGenerationPrompt) dom.imageGenerationPrompt.focus();
    }, 0);
}

function closeImageGenerationPanel() {
    if (imageGenerationIsGenerating || !dom.imageGenerationPanel) return;
    dom.imageGenerationPanel.classList.add('hidden');
    dom.imageGenerationPanel.setAttribute('aria-hidden', 'true');
    setImageGenerationPanelStatus('');
    var focusTarget = imageGenerationPreviousFocus || dom.imageGenerationBtn;
    imageGenerationPreviousFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
}

function isImageGenerationPanelOpen() {
    return !!(
        dom.imageGenerationPanel &&
        dom.imageGenerationPanel.id === 'imageGenerationPanel' &&
        !dom.imageGenerationPanel.classList.contains('hidden')
    );
}

function handleImageGenerationPanelKeydown(event) {
    if (!event || !isImageGenerationPanelOpen()) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (imageGenerationIsGenerating) cancelImageGenerationRequest();
        else closeImageGenerationPanel();
        return;
    }
    if (event.key !== 'Tab') return;

    var focusable = getImageGenerationPanelFocusableElements();
    if (!focusable.length) {
        event.preventDefault();
        return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function getImageGenerationPanelFocusableElements() {
    if (!dom.imageGenerationPanel || typeof dom.imageGenerationPanel.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(dom.imageGenerationPanel.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function(element) {
        return !element.classList || !element.classList.contains('hidden');
    });
}
