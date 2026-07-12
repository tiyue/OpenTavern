/**
 * 新手导读（文件：31-api-connection-response-helpers.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、连接、响应、辅助函数”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：主要从 `collectApiTestModelNames(data)`、`readApiTestHttpError(resp)`、`describeApiTestFetchError(error)`、`buildApiTestSuggestions(rawEndpoint)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
// ==================== API Connection Test Response Helpers ====================
function collectApiTestModelNames(data) {
    if (data && Array.isArray(data.data)) {
        return data.data.map(function(model) {
            return model && (model.id || model.name) || String(model);
        }).filter(Boolean);
    }
    if (Array.isArray(data)) {
        return data.map(function(model) {
            return model && (model.id || model.name) || String(model);
        }).filter(Boolean);
    }
    return [];
}

async function readApiTestHttpError(resp) {
    var text = await resp.text().catch(function() { return ''; });
    var errMsg = 'HTTP ' + resp.status;
    try {
        var json = JSON.parse(text);
        if (json.error && json.error.message) errMsg += ' - ' + json.error.message;
        else if (json.message) errMsg += ' - ' + json.message;
    } catch (e) {
        if (text) errMsg += ' - ' + text.slice(0, 300);
    }
    return errMsg;
}

function describeApiTestFetchError(error) {
    var secs = API_CONNECTION_TEST_TIMEOUT_MS / 1000;
    if (error.name === 'AbortError') return t('api_test_timeout_msg').replace('{s}', secs);
    if (error instanceof TypeError) return t('api_test_typeerror_prefix') + (error.message || 'Failed to fetch');
    return error.message || String(error);
}

function buildApiTestSuggestions(rawEndpoint) {
    var suggestions = [];
    var rawLower = String(rawEndpoint || '').toLowerCase();
    if (rawLower.includes('localhost') || rawLower.includes('127.0.0.1')) {
        suggestions.push(t('api_test_suggest_localhost'));
    }
    suggestions.push(t('api_test_suggest_cors'));
    suggestions.push(t('api_test_suggest_endpoint_path'));
    suggestions.push(t('api_test_suggest_apikey'));
    suggestions.push(t('api_test_suggest_stream'));
    suggestions.push(t('api_test_suggest_gateway'));
    return suggestions;
}
