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
