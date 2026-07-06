// ==================== Chat Completion Response Stream ====================
function streamChatCompletionResponse(response, captureCot, onToken, onComplete, onError) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var fullContent = '';
    var fullCot = '';

    function completeStream() {
        finishGenerationStreamState();
        var finalParts = buildCotAwareParts(captureCot, fullContent, fullCot);
        onComplete(finalParts.content, finalParts.cot);
    }

    function processStreamLine(line) {
        var trimmed = line.trim();
        if (!trimmed || trimmed.indexOf('data: ') !== 0) return false;
        var data = trimmed.slice(6);
        if (data === '[DONE]') {
            completeStream();
            return true;
        }
        try {
            var json = JSON.parse(data);
            var delta = json.choices && json.choices[0] && json.choices[0].delta;
            var cotDelta = captureCot ? extractCotDelta(delta) : '';
            var contentDelta = delta && delta.content ? delta.content : '';
            if (cotDelta) fullCot += cotDelta;
            if (contentDelta) fullContent += contentDelta;
            if (contentDelta || cotDelta) {
                var parts = buildCotAwareParts(captureCot, fullContent, fullCot);
                onToken(contentDelta, parts.content, parts.cot);
            }
        } catch(e) { /* skip malformed */ }
        return false;
    }

    function pump() {
        reader.read().then(function(result) {
            if (result.done) {
                completeStream();
                return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
                if (processStreamLine(lines[i])) return;
            }
            pump();
        }).catch(function(e) {
            finishGenerationStreamState();
            if (e.name === 'AbortError') {
                var abortParts = buildCotAwareParts(captureCot, fullContent, fullCot);
                onComplete(abortParts.content, abortParts.cot);
            } else {
                onError(e);
            }
        });
    }

    pump();
}

