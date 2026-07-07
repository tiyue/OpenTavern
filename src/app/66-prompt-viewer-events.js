// ==================== Prompt Viewer Events ====================
function refreshPromptViewer() {
    try {
        var messages;
        if (currentPromptViewerStage === 'second') {
            var conv = getActiveConv();
            var latestMain = findLatestMainAssistantMessage(conv);
            messages = buildMessagesForSecondStage(latestMain);
        } else {
            messages = buildMessagesForAPI();
        }
        var text = formatPromptMessages(messages);
        dom.promptViewerContent.textContent = text || t('no_messages_to_send');
    } catch (err) {
        console.error('showFullPrompt error:', err);
        alert('鏃犳硶鐢熸垚鎻愮ず璇嶉瑙堬細' + (err.message || err));
    }
}

function showFullPrompt() {
    setPromptStageButtons('main');
    refreshPromptViewer();
    dom.promptViewerModal.classList.remove('hidden');
}

function closePromptViewer() {
    dom.promptViewerModal.classList.add('hidden');
}

function bindPromptViewerEvents() {
    dom.viewPromptBtn.addEventListener('click', showFullPrompt);
    if (dom.promptStageMainBtn) dom.promptStageMainBtn.addEventListener('click', function() {
        setPromptStageButtons('main');
        refreshPromptViewer();
    });
    if (dom.promptStageSecondBtn) dom.promptStageSecondBtn.addEventListener('click', function() {
        setPromptStageButtons('second');
        refreshPromptViewer();
    });
    dom.promptViewerCloseBtn.addEventListener('click', closePromptViewer);
    dom.promptViewerBackdrop.addEventListener('click', closePromptViewer);
    dom.copyPromptBtn.addEventListener('click', copyPromptViewerText);
}
