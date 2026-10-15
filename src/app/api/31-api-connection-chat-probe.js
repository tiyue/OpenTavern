/**
 * 新手导读（文件：31-api-connection-chat-probe.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、连接、聊天、连通性测试”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：主要从 `runApiChatCompletionFallbackTest(chatUrl, apiKey, model, tested)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
// ==================== API Connection Chat Probe ====================
async function runApiChatCompletionFallbackTest(chatUrl, apiKey, model, tested) {
    try {
        tested.push('POST ' + chatUrl + ' (stream:false)');
        var chatHeaders = { 'Content-Type': 'application/json' };
        if (apiKey) chatHeaders.Authorization = 'Bearer ' + apiKey;

        var chatResp = await fetchApiTestWithTimeout(chatUrl, {
            method: 'POST',
            headers: chatHeaders,
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 1,
                temperature: 0,
                stream: false
            })
        });

        if (chatResp.ok) {
            var chatData = await chatResp.json().catch(function() { return {}; });
            var hasChoice = chatData && chatData.choices && chatData.choices[0];
            return t('api_test_fallback_success') + (hasChoice ? t('api_test_fallback_success_choice') : t('api_test_fallback_success_ok'));
        }

        return t('api_test_fallback_failed_prefix') + await readApiTestHttpError(chatResp);
    } catch (e) {
        if (e.name === 'AbortError') return t('api_test_fallback_failed_prefix') + t('api_test_timeout_short');
        if (e instanceof TypeError) return t('api_test_fallback_failed_prefix') + t('api_test_typeerror_cors_note');
        return t('api_test_fallback_failed_prefix') + (e.message || String(e));
    }
}
