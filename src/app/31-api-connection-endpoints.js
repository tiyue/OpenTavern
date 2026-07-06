// ==================== API Connection Test Endpoints ====================
function deriveApiModelsEndpoint(raw) {
    var url = String(raw || '').trim().replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/i, '');
    if (/\/(v[0-9]+|openai\/v1|paas\/v[0-9]+)$/.test(url)) {
        return url + '/models';
    }
    if (!/\/v[0-9]/.test(url) && !url.includes('/paas/')) {
        url += '/v1';
    }
    return url + '/models';
}

async function fetchApiTestWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, API_CONNECTION_TEST_TIMEOUT_MS);
    try {
        var resp = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        clearTimeout(timer);
        return resp;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}
