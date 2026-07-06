// ==================== Message Text Formatting ====================
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
