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
