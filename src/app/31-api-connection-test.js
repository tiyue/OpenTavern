// ==================== API Connection Test ====================
window.testMainApiConnection = function() {
    var epEl = document.getElementById('apiEndpoint');
    var keyEl = document.getElementById('apiKey');
    var modelEl = document.getElementById('modelName');
    var resultEl = document.getElementById('apiTestResult');

    var rawEndpoint = epEl ? epEl.value.trim() : '';
    var apiKey = keyEl ? keyEl.value.trim() : '';
    var model = modelEl ? modelEl.value.trim() || 'gpt-3.5-turbo' : 'gpt-3.5-turbo';

    if (!resultEl) return;

    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<span class="text-amber-400">' + t('api_test_testing') + '</span>';

    if (!rawEndpoint) {
        resultEl.innerHTML = '<div class="text-red-400">' + t('api_test_need_endpoint') + '</div>';
        return;
    }

    var modelsUrl = deriveApiModelsEndpoint(rawEndpoint);
    var chatUrl = normalizeApiEndpoint(rawEndpoint);

    (async function runTest() {
        var tested = [];
        var modelsErrInfo = '';

        try {
            tested.push('GET ' + modelsUrl);
            var headers = {};
            if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
            var resp = await fetchApiTestWithTimeout(modelsUrl, { method: 'GET', headers: headers });

            if (resp.ok) {
                var data = await resp.json().catch(function() { return {}; });
                resultEl.innerHTML = buildApiTestSuccessHtml(collectApiTestModelNames(data));
                return;
            }
            modelsErrInfo = await readApiTestHttpError(resp);
        } catch (e) {
            modelsErrInfo = describeApiTestFetchError(e);
        }

        var chatResult = '';
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
                chatResult = t('api_test_fallback_success') + (hasChoice ? t('api_test_fallback_success_choice') : t('api_test_fallback_success_ok'));
            } else {
                chatResult = t('api_test_fallback_failed_prefix') + await readApiTestHttpError(chatResp);
            }
        } catch (e2) {
            if (e2.name === 'AbortError') chatResult = t('api_test_fallback_failed_prefix') + t('api_test_timeout_short');
            else if (e2 instanceof TypeError) chatResult = t('api_test_fallback_failed_prefix') + t('api_test_typeerror_cors_note');
            else chatResult = t('api_test_fallback_failed_prefix') + (e2.message || String(e2));
        }

        var detail = t('api_test_models_failed_prefix') + (modelsErrInfo || t('api_test_unknown_error'));
        if (chatResult) detail += '\n' + chatResult;
        resultEl.innerHTML = buildApiTestErrorHtml(t('api_test_failed_title'), detail, buildApiTestSuggestions(rawEndpoint), tested);
    })();
};
