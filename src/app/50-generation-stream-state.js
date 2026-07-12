/**
 * 新手导读（文件：50-generation-stream-state.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、流式数据、状态”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `beginGenerationStreamState(无参数)`、`finishGenerationStreamState(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
// ==================== Generation Stream State Helpers ====================
function beginGenerationStreamState() {
    var controller = new AbortController();
    state.abortController = controller;
    state.isGenerating = true;
    appStore.notify('isGenerating');
    return controller;
}

function finishGenerationStreamState() {
    state.isGenerating = false;
    appStore.notify('isGenerating');
    state.abortController = null;
}
