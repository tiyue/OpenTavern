// ==================== Generation CoT Helpers ====================
function extractCotDelta(delta) {
    if (!delta) return '';
    var val = delta.reasoning_content || delta.reasoning || delta.thinking || delta.cot;
    if (typeof val === 'string') return val;
    if (val && typeof val.content === 'string') return val.content;
    if (Array.isArray(val)) {
        return val.map(function(part) {
            if (typeof part === 'string') return part;
            return part && (part.text || part.content) ? String(part.text || part.content) : '';
        }).join('');
    }
    return '';
}

function splitInlineCot(content, existingCot) {
    var text = String(content || '');
    var cot = String(existingCot || '');
    var re = /<think(?:ing)?\b[^>]*>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi;
    var match;
    while ((match = re.exec(text)) !== null) {
        if (match[1]) cot += (cot ? '\n' : '') + match[1].trim();
    }
    text = text.replace(re, '').trim();
    return { content: text, cot: cot.trim() };
}

function buildCotAwareParts(captureCot, content, cot) {
    return captureCot
        ? splitInlineCot(content || '', cot || '')
        : { content: content || '', cot: '' };
}
