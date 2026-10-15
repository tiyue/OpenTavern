/**
 * 新手导读（文件：53-summarization-service.js）
 *
 * 负责什么：这是“总结服务”中的“总结、存储服务”部分。
 * 在程序中的位置：它构建总结提示词并调用独立或主模型 API 生成会话总结。
 * 从哪里开始看：主要从 `generateSummary(messages, callback)`、`getSummarizationCredentials(settings)`、`buildSummaryMessages(messages, settings, summaryPrompt)`、`extractSummaryText(data)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：总结长度限制和语言设置会影响上下文占用，不要绕过统一的限制计算。
 */
// ==================== Summarization Service ====================
function generateSummary(messages, callback) {
    var settings = state.settings;
    var credentials = getSummarizationCredentials(settings);

    if (!credentials.apiKey || !credentials.apiEndpoint) {
        callback(new Error(t('no_api_error')));
        return;
    }

    var promptConfig = buildSummaryPromptConfig(settings);
    var summaryMessages = buildSummaryMessages(messages, settings, promptConfig.prompt);
    var endpoint = normalizeApiEndpoint(credentials.apiEndpoint);

    if (shouldUseOllamaCompat(credentials.apiEndpoint)) {
        summaryMessages = normalizeMessagesForOllamaCompatibility(summaryMessages);
    }

    requestSummaryCompletion(endpoint, credentials.apiKey, credentials.model, summaryMessages, promptConfig.maxTokens)
        .then(function(data) {
            var text = extractSummaryText(data);
            if (!text) {
                callback(new Error('Unexpected API response'));
                return;
            }
            callback(null, text);
        })
        .catch(function(e) {
            callback(e);
        });
}

function getSummarizationCredentials(settings) {
    var useMainAPI = settings.summarizeUseMainAPI !== false;
    return {
        apiEndpoint: useMainAPI ? settings.apiEndpoint : (settings.summarizeApiEndpoint || settings.apiEndpoint),
        apiKey: useMainAPI ? settings.apiKey : (settings.summarizeApiKey || settings.apiKey),
        model: useMainAPI ? settings.model : (settings.summarizeModel || settings.model || 'deepseek-chat')
    };
}

function buildSummaryMessages(messages, settings, summaryPrompt) {
    return [
        { role: 'system', content: summaryPrompt },
        { role: 'user', content: messages.map(function(m) {
            return (m.role === 'user' ? (settings.userName || 'User') : 'Assistant') + ': ' + m.content;
        }).join('\n\n') }
    ];
}

function extractSummaryText(data) {
    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
        return '';
    }

    var choice = data.choices[0];
    var raw = (choice.message.content || '').trim();
    if ((choice.finish_reason === 'length' || choice.finish_reason === 'max_tokens') && raw) {
        var truncWarn = t('summary_truncated_warning') || '';
        if (truncWarn) raw = truncWarn + '\n' + raw;
    }
    return raw;
}
