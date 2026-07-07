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
