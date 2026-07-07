// ==================== API Endpoint Normalizer ====================
function normalizeApiEndpoint(raw) {
    if (!raw) return raw;
    var url = String(raw).trim().replace(/\/+$/, '');

    if (url.includes('/chat/completions')) return url;

    if (/^https?:\/\/api\.deepseek\.com(\/.*)?$/.test(url)) {
        return url.replace(/\/$/, '') + '/chat/completions';
    }

    if (url.includes('bigmodel.cn/api/paas/v4') || url.includes('z.ai/api/paas/v4')) {
        return url + '/chat/completions';
    }

    if (/\/(v[0-9]+|openai\/v1)$/.test(url)) {
        return url + '/chat/completions';
    }

    if (!/\/v[0-9]/.test(url) && !url.includes('/paas/')) {
        url += '/v1';
    }
    return url + '/chat/completions';
}
