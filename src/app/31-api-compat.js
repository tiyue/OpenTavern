// 统一的 API Endpoint 规范化（支持 DeepSeek 无 /v1、智谱 /v4、Groq /openai/v1 等各种变体）
function normalizeApiEndpoint(raw) {
    if (!raw) return raw;
    var url = String(raw).trim().replace(/\/+$/, ''); // 去掉末尾斜杠

    if (url.includes('/chat/completions')) return url;

    // 已知需要直接追加 /chat/completions 的情况
    // DeepSeek 官方就是 https://api.deepseek.com （无 v1）
    if (/^https?:\/\/api\.deepseek\.com(\/.*)?$/.test(url)) {
        return url.replace(/\/$/, '') + '/chat/completions';
    }

    // 智谱 GLM 特殊路径
    if (url.includes('bigmodel.cn/api/paas/v4') || url.includes('z.ai/api/paas/v4')) {
        return url + '/chat/completions';
    }

    // 标准 OpenAI 兼容：以 /v1 或 /openai/v1 结尾
    if (/\/(v[0-9]+|openai\/v1)$/.test(url)) {
        return url + '/chat/completions';
    }

    // 其他情况：如果没有版本号就补 /v1，否则直接补
    if (!/\/v[0-9]/.test(url) && !url.includes('/paas/')) {
        url += '/v1';
    }
    return url + '/chat/completions';
}

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
