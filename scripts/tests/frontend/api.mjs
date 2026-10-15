import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendApiConnectionHelpers() {
  const helperSources = await Promise.all([
    '../../../src/app/api/31-api-connection-test-config.js',
    '../../../src/app/api/31-api-connection-endpoints.js',
    '../../../src/app/api/31-api-connection-result-ui.js',
    '../../../src/app/api/31-api-connection-response-helpers.js',
    '../../../src/app/api/31-api-connection-models-probe.js',
    '../../../src/app/api/31-api-connection-chat-probe.js',
    '../../../src/app/api/31-api-connection-test-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const translations = {
    api_test_success_title: 'Connection OK',
    api_test_models_prefix: 'Models ',
    api_test_models_total: ' of ',
    api_test_models_mid: ':',
    api_test_more_omitted: 'more omitted',
    api_test_models_empty_note: 'No models returned',
    api_test_tested_urls_label: 'Tested URLs',
    api_test_suggest_title: 'Suggestions',
    api_test_timeout_msg: 'Timeout after {s}s',
    api_test_typeerror_prefix: 'Network error: ',
    api_test_fallback_success: 'Chat probe OK: ',
    api_test_fallback_success_choice: 'choice',
    api_test_fallback_success_ok: 'response',
    api_test_fallback_failed_prefix: 'Chat probe failed: ',
    api_test_timeout_short: 'timeout',
    api_test_typeerror_cors_note: 'CORS',
    api_test_suggest_localhost: 'Check local server',
    api_test_suggest_cors: 'Check CORS',
    api_test_suggest_endpoint_path: 'Check endpoint path',
    api_test_suggest_apikey: 'Check API key',
    api_test_suggest_stream: 'Check stream',
    api_test_suggest_gateway: 'Check gateway',
  };
  const context = {
    t: (key) => translations[key] || key,
    JSON,
    String,
    Array,
    Boolean,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(`${helperSources.join('\n')}\nthis.__derive = deriveApiModelsEndpoint;\nthis.__collect = collectApiTestModelNames;\nthis.__readHttp = readApiTestHttpError;\nthis.__success = buildApiTestSuccessHtml;\nthis.__suggestions = buildApiTestSuggestions;\nthis.__modelsProbe = runApiModelsEndpointTest;\nthis.__chatProbe = runApiChatCompletionFallbackTest;`, context);

  assert(context.__derive('https://api.example.com/v1/chat/completions') === 'https://api.example.com/v1/models', 'Models URL was not derived from chat completions endpoint.');
  assert(context.__derive('https://api.deepseek.com') === 'https://api.deepseek.com/v1/models', 'Models URL should add /v1 when the endpoint has no version.');
  assert(context.__derive('https://host/openai/v1') === 'https://host/openai/v1/models', 'Models URL should preserve openai/v1 endpoints.');

  const names = context.__collect({ data: [{ id: 'alpha' }, { name: 'beta' }, 'gamma'] });
  assert(names.join(',') === 'alpha,beta,gamma', 'Model name collection did not preserve id/name/string entries.');

  const html = context.__success(Array.from({ length: 13 }, (_, idx) => `m${idx}`));
  assert(html.includes('m0') && html.includes('more omitted'), 'Success HTML did not render model list truncation.');

  const suggestions = context.__suggestions('http://127.0.0.1:11434/v1');
  assert(suggestions.includes('Check local server') && suggestions.includes('Check CORS'), 'API test suggestions missed local/CORS hints.');

  const errorText = await context.__readHttp({
    status: 401,
    async text() {
      return JSON.stringify({ error: { message: 'bad key' } });
    },
  });
  assert(errorText === 'HTTP 401 - bad key', 'HTTP error message parser did not preserve API error detail.');

  const tested = [];
  context.fetch = async function(url, options) {
    if (url.endsWith('/models')) {
      assert(options.headers.Authorization === 'Bearer probe-key', 'Models probe should send bearer auth when an API key is provided.');
      return { ok: true, async json() { return { data: [{ id: 'probe-model' }] }; } };
    }
    assert(options.method === 'POST' && JSON.parse(options.body).stream === false, 'Chat probe should send a non-streaming chat completion request.');
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  const modelsProbe = await context.__modelsProbe('https://api.example/v1/models', 'probe-key', tested);
  assert(modelsProbe.ok === true && modelsProbe.html.includes('probe-model'), 'Models probe should return success HTML for model list responses.');
  const chatProbe = await context.__chatProbe('https://api.example/v1/chat/completions', 'probe-key', 'probe-model', tested);
  assert(chatProbe.includes('Chat probe OK: choice'), 'Chat probe should report successful chat completion fallback responses.');
  assert(tested.join('|') === 'GET https://api.example/v1/models|POST https://api.example/v1/chat/completions (stream:false)', 'API probes should record tested endpoints in order.');
}

async function assertFrontendApiCompatibilityHelpers() {
  const sources = await Promise.all([
    '../../../src/app/api/31-api-endpoint-normalizer.js',
    '../../../src/app/api/31-api-ollama-compat.js',
    '../../../src/app/api/31-api-compat.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    state: { settings: {} },
    normalizePromptRole(role) {
      if (role === 'developer') return 'system';
      if (role === 'assistant') return 'assistant';
      if (role === 'system') return 'system';
      return 'user';
    },
    String,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__endpoint = normalizeApiEndpoint;\nthis.__likelyOllama = isLikelyOllamaEndpoint;\nthis.__useOllama = shouldUseOllamaCompat;\nthis.__messages = normalizeMessagesForOllamaCompatibility;`, context);

  assert(context.__endpoint('https://api.deepseek.com') === 'https://api.deepseek.com/chat/completions', 'API compat should normalize DeepSeek base endpoints without adding /v1.');
  assert(context.__endpoint('https://host/openai/v1') === 'https://host/openai/v1/chat/completions', 'API compat should preserve OpenAI-compatible /openai/v1 endpoints.');
  assert(context.__endpoint('https://chat.example') === 'https://chat.example/v1/chat/completions', 'API compat should add /v1 to unversioned OpenAI-compatible endpoints.');
  assert(context.__endpoint('https://bigmodel.cn/api/paas/v4') === 'https://bigmodel.cn/api/paas/v4/chat/completions', 'API compat should preserve GLM v4 paths.');
  assert(context.__endpoint('https://already/v1/chat/completions') === 'https://already/v1/chat/completions', 'API compat should leave full chat completion URLs unchanged.');

  assert(context.__likelyOllama('http://127.0.0.1:11434/v1') === true, 'API compat should detect default Ollama ports.');
  assert(context.__useOllama('https://api.example/v1') === false, 'API compat should not force Ollama mode for normal endpoints.');
  assert(context.__useOllama('http://127.0.0.1:11434/v1') === true, 'API compat should enable Ollama compatibility for Ollama-like endpoints.');

  const messages = context.__messages([
    { role: 'system', content: 'base' },
    { role: 'developer', content: 'dev' },
    { role: 'user', content: 'hello' },
    { role: 'system', content: 'late' },
    { role: 'assistant', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: '   ' },
  ]);
  assert(messages.map((msg) => msg.role).join(',') === 'system,user,assistant', 'Ollama compat should collapse adjacent compatible message roles.');
  assert(messages[0].content === 'base\n\ndev', 'Ollama compat should merge leading system/developer instructions.');
  assert(messages[1].content.includes('hello') && messages[1].content.includes('[System / developer instruction]\nlate'), 'Ollama compat should convert late system messages to user instructions.');
  assert(messages[2].content === 'first\n\nsecond', 'Ollama compat should merge adjacent assistant messages.');
}
export { assertFrontendApiConnectionHelpers, assertFrontendApiCompatibilityHelpers };
