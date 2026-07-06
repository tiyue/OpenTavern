// ==================== Message Attachments Rendering ====================
function renderMessageAttachments(msg) {
    if (!msg || !Array.isArray(msg.attachments) || msg.attachments.length === 0) return '';
    var html = '<div class="msg-attachments">';
    msg.attachments.forEach(function(att) {
        if (!att || att.type !== 'image') return;
        var src = att.dataUrl || att.url || '';
        if (!src) return;
        var label = att.source === 'comfyui' ? 'ComfyUI' : (att.source || 'Image');
        var prompt = att.prompt ? String(att.prompt) : '';
        html += '<figure>';
        html += '<img class="msg-attachment-image" src="' + escapeHtml(src) + '" alt="' + escapeHtml(label) + '" loading="lazy">';
        html += '<figcaption class="msg-attachment-caption">' + escapeHtml(label + (prompt ? ' · ' + prompt.slice(0, 180) : '')) + '</figcaption>';
        html += '</figure>';
    });
    html += '</div>';
    return html;
}
