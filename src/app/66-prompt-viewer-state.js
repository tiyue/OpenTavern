// ==================== Prompt Viewer State ====================
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
