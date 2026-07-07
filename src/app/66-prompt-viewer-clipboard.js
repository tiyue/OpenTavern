// ==================== Prompt Viewer Clipboard ====================
function copyPromptViewerText() {
    var text = dom.promptViewerContent.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            dom.copyPromptBtn.textContent = t('copied');
            setTimeout(function() { dom.copyPromptBtn.textContent = t('copy'); }, 1500);
        });
    }
}
