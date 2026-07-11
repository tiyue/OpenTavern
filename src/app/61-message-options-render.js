// ==================== Message Options Rendering ====================
function renderOptionsXml(raw) {
    var text = String(raw || '').trim();
    if (!/^<options[\s>]/i.test(text)) return '';
    try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return '';
        var optionNodes = Array.prototype.slice.call(doc.getElementsByTagName('option')).slice(0, 4);
        if (!optionNodes.length) return '';
        var html = '<div class="space-y-2">';
        optionNodes.forEach(function(node) {
            var titleNode = node.getElementsByTagName('title')[0];
            var descNode = node.getElementsByTagName('description')[0];
            var title = titleNode ? titleNode.textContent.trim() : '';
            var desc = descNode ? descNode.textContent.trim() : '';
            var activationHint = t('message_option_activation_hint') || '单击选中，再次点击发送';
            var selectedHint = t('message_option_selected_hint') || '已选中 · 再次点击发送';
            html += '<button type="button" class="message-option-choice glass rounded-xl border border-white/10 px-3 py-2"' +
                ' data-option-title="' + escapeHtml(title) + '" data-option-description="' + escapeHtml(desc) + '"' +
                ' aria-pressed="false" title="' + escapeHtml(activationHint) + '">';
            if (title) html += '<div class="text-sm font-semibold text-amber-300 mb-1">' + escapeHtml(title) + '</div>';
            if (desc) html += '<div class="text-sm text-zinc-300 leading-relaxed">' + highlightDialogue(desc) + '</div>';
            html += '<span class="message-option-selected-hint" aria-hidden="true">' + escapeHtml(selectedHint) + '</span>';
            html += '</button>';
        });
        html += '</div>';
        return html;
    } catch (e) {
        return '';
    }
}
