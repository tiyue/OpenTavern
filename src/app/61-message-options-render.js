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
            html += '<div class="glass rounded-xl border border-white/10 px-3 py-2">';
            if (title) html += '<div class="text-sm font-semibold text-amber-300 mb-1">' + escapeHtml(title) + '</div>';
            if (desc) html += '<div class="text-sm text-zinc-300 leading-relaxed">' + highlightDialogue(desc) + '</div>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    } catch (e) {
        return '';
    }
}
