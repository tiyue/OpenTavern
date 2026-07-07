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
            var modelsResult = await runApiModelsEndpointTest(modelsUrl, apiKey, tested);
            if (modelsResult.ok) {
                resultEl.innerHTML = modelsResult.html;
                return;
            }
            modelsErrInfo = modelsResult.error;
        } catch (e) {
            modelsErrInfo = describeApiTestFetchError(e);
        }

        var chatResult = await runApiChatCompletionFallbackTest(chatUrl, apiKey, model, tested);

        var detail = t('api_test_models_failed_prefix') + (modelsErrInfo || t('api_test_unknown_error'));
        if (chatResult) detail += '\n' + chatResult;
        resultEl.innerHTML = buildApiTestErrorHtml(t('api_test_failed_title'), detail, buildApiTestSuggestions(rawEndpoint), tested);
    })();
};
