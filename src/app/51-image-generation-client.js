// ==================== Qwen Image Client ====================
async function requestQwenImageGeneration(payload, signal) {
    var settings = ensureImageGenerationSettings();
    var endpoint = normalizeImageGenerationEndpoint(settings.imageGenerationEndpoint);
    var headers = { 'Content-Type': 'application/json' };
    var token = getImageGenerationAccessToken();
    if (token) headers['X-OpenTavern-Image-Token'] = token;

    var response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: signal
    });
    var responseText = await response.text();
    var data = null;
    try { data = responseText ? JSON.parse(responseText) : null; } catch (_) {}

    if (!response.ok || data && data.success === false) {
        throw createImageGenerationRequestError(response.status, data, data ? '' : null);
    }
    if (!data || data.success !== true || !data.asset || !data.asset.url) {
        throw new Error('图片服务返回了无效响应。');
    }

    return {
        asset: normalizeQwenImageAsset(data.asset, endpoint),
        requestId: String(data.requestId || ''),
        model: String(data.model || 'qwen-image')
    };
}

function normalizeQwenImageAsset(asset, endpoint) {
    return {
        id: String(asset.id || ''),
        url: resolveQwenImageAssetUrl(asset.url, endpoint),
        mime: String(asset.mime || 'image/png'),
        width: Math.max(0, Number(asset.width) || 0),
        height: Math.max(0, Number(asset.height) || 0)
    };
}

function resolveQwenImageAssetUrl(value, endpoint) {
    var url = String(value || '').trim();
    if (!url || /^(data:|blob:)/i.test(url)) return url;
    try {
        var endpointUrl = new URL(endpoint, window.location.href);
        return new URL(url, endpointUrl).href;
    } catch (_) {
        return url;
    }
}
