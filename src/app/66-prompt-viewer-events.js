// ==================== Prompt Viewer Events ====================
var currentPromptViewerStage = 'main';

function setPromptStageButtons(stage) {
    currentPromptViewerStage = stage || 'main';
    var active = ['bg-amber-500/20', 'text-amber-300', 'border-amber-500/20'];
    var inactive = ['bg-white/5', 'text-zinc-400', 'border-white/10'];
    [
        { btn: dom.promptStageMainBtn, stage: 'main' },
        { btn: dom.promptStageSecondBtn, stage: 'second' }
    ].forEach(function(item) {
        if (!item.btn) return;
        item.btn.classList.remove.apply(item.btn.classList, active.concat(inactive));
        item.btn.classList.add.apply(item.btn.classList, item.stage === currentPromptViewerStage ? active : inactive);
    });
}

function findLatestMainAssistantMessage(conv) {
    if (!conv || !Array.isArray(conv.messages)) return null;
    for (var i = conv.messages.length - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage !== 'second') return m;
    }
    return null;
}

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

function copyPromptViewerText() {
    var text = dom.promptViewerContent.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            dom.copyPromptBtn.textContent = t('copied');
            setTimeout(function() { dom.copyPromptBtn.textContent = t('copy'); }, 1500);
        });
    }
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
