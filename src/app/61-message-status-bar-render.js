// ==================== Message Status Bar Rendering ====================
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
