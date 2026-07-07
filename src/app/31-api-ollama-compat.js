// ==================== Ollama API Compatibility ====================
function isLikelyOllamaEndpoint(raw) {
    if (!raw) return false;
    var s = String(raw).toLowerCase();
    return s.indexOf('ollama') !== -1 || s.indexOf(':11434') !== -1;
}

function shouldUseOllamaCompat(endpoint) {
    var settings = state && state.settings ? state.settings : {};
    return !!settings.ollamaCompatMode || isLikelyOllamaEndpoint(endpoint);
}

function normalizeMessagesForOllamaCompatibility(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return messages || [];

    var systemParts = [];
    var normalized = [];
    var seenNonSystem = false;

    messages.forEach(function(msg) {
        if (!msg) return;
        var role = normalizePromptRole(msg.role || 'user');
        var content = msg.content == null ? '' : String(msg.content);
        if (!content.trim()) return;

        if (role === 'system') {
            if (!seenNonSystem) {
                systemParts.push(content);
            } else {
                normalized.push({
                    role: 'user',
                    content: '[System / developer instruction]\n' + content
                });
            }
            return;
        }

        seenNonSystem = true;
        normalized.push({ role: role, content: content });
    });

    var result = [];
    if (systemParts.length > 0) {
        result.push({ role: 'system', content: systemParts.join('\n\n') });
    }
    result = result.concat(normalized);

    return result.reduce(function(acc, msg) {
        var last = acc[acc.length - 1];
        if (last && last.role === msg.role) {
            last.content += '\n\n' + msg.content;
        } else {
            acc.push({ role: msg.role, content: msg.content });
        }
        return acc;
    }, []);
}
