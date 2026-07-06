// ==================== Summary API Client ====================
function requestSummaryCompletion(endpoint, apiKey, model, summaryMessages, maxTokens) {
    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
            model: model,
            messages: summaryMessages,
            max_tokens: maxTokens,
            temperature: 0.3,
            stream: false
        })
    }).then(function(r) {
        return r.json();
    });
}
