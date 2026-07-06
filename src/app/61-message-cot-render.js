// ==================== Message CoT Rendering ====================
function renderCotBlock(cot, streaming) {
    if (!cot || !state || !state.settings || state.settings.showCotEnabled === false) return '';
    var cls = 'msg-cot' + (streaming ? ' streaming' : '');
    return '<details class="' + cls + '"><summary>' + escapeHtml(t('cot_block_title') || 'Thinking') + '</summary><div class="msg-cot-content">' + escapeHtml(cot) + '</div></details>';
}
