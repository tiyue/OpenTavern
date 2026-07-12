/**
 * 新手导读（文件：31-api-ollama-compat.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、Ollama 接口、兼容处理”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：主要从 `isLikelyOllamaEndpoint(raw)`、`shouldUseOllamaCompat(endpoint)`、`normalizeMessagesForOllamaCompatibility(messages)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
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
