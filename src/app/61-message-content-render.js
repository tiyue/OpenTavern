// ==================== Message Content Rendering ====================
function renderAssistantContent(text) {
    if (!text) return '';

    var raw = String(text);
    var optionsHtml = renderOptionsXml(raw);
    if (optionsHtml) return optionsHtml;

    var html = '';
    var lastIndex = 0;
    var statusBlockRe = /<details\b[\s\S]*?<\/details>/gi;
    var match;

    while ((match = statusBlockRe.exec(raw)) !== null) {
        var block = match[0];
        if (block.indexOf('状态栏') === -1 && block.indexOf('狀態欄') === -1) continue;

        html += highlightDialogue(raw.slice(lastIndex, match.index));
        html += sanitizeStatusBarHtml(block);
        lastIndex = match.index + block.length;
    }

    html += highlightDialogue(raw.slice(lastIndex));
    return html;
}

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

function renderMessageBubbleContent(msg, isUser) {
    var content = isUser ? escapeHtml(msg && msg.content) : renderAssistantContent(msg && msg.content);
    return content + renderMessageAttachments(msg);
}
