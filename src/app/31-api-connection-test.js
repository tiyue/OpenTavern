/**
 * 新手导读（文件：31-api-connection-test.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、连接、测试”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
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
