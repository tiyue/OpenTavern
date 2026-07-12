/**
 * 新手导读（文件：53-summary-api-client.js）
 *
 * 负责什么：这是“总结服务”中的“总结、模型接口、客户端”部分。
 * 在程序中的位置：它构建总结提示词并调用独立或主模型 API 生成会话总结。
 * 从哪里开始看：主要从 `requestSummaryCompletion(endpoint, apiKey, model, summaryMessages, maxTokens)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：总结长度限制和语言设置会影响上下文占用，不要绕过统一的限制计算。
 */
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
