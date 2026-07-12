/**
 * 新手导读（文件：50-generation-response-stream.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、响应、流式数据”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `streamChatCompletionResponse(response, captureCot, onToken, onComplete, onError)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
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

