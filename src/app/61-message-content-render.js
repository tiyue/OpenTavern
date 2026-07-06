// ==================== Message Content Rendering ====================
function escapeHtml(text) {
    if (!text) return '';
    text = String(text);
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlightDialogue(text) {
    if (!text) return '';
    var escaped = escapeHtml(text);
    // Highlight Chinese curly double quotes “...”
    escaped = escaped.replace(/“([\s\S]*?)”/g, '<span class="dialogue-highlight">“$1”</span>');
    // Highlight corner brackets 「...」
    escaped = escaped.replace(/「([\s\S]*?)」/g, '<span class="dialogue-highlight">「$1」</span>');
    return escaped;
}

function sanitizeStatusBarHtml(html) {
    if (!window.DOMPurify) return highlightDialogue(html);

    var clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['details', 'summary', 'div', 'br', 'span', 'b', 'strong'],
        ALLOWED_ATTR: ['open'],
        ALLOW_DATA_ATTR: false,
        FORBID_ATTR: ['style', 'class', 'id', 'onclick', 'onerror', 'onload']
    });

    clean = clean.replace(/<details([^>]*)>/i, function(match, attrs) {
        return '<details class="status-bar"' + (/\bopen\b/i.test(attrs || '') ? ' open' : '') + '>';
    });
    clean = clean.replace(/<summary>/i, '<summary>');
    clean = clean.replace(/(<\/summary>)([\s\S]*?)(<\/details>)/i, '$1<div class="status-bar-content">$2</div>$3');

    return clean;
}

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

function renderCotBlock(cot, streaming) {
    if (!cot || !state || !state.settings || state.settings.showCotEnabled === false) return '';
    var cls = 'msg-cot' + (streaming ? ' streaming' : '');
    return '<details class="' + cls + '"><summary>' + escapeHtml(t('cot_block_title') || 'Thinking') + '</summary><div class="msg-cot-content">' + escapeHtml(cot) + '</div></details>';
}

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
