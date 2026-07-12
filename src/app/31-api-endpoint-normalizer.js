/**
 * 新手导读（文件：31-api-endpoint-normalizer.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口地址、规范化”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：主要从 `normalizeApiEndpoint(raw)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
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
