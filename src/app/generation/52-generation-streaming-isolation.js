/**
 * 新手导读（文件：52-generation-streaming-isolation.js）
 *
 * 负责什么：这是“回复生成主流程”中的“内容生成、流式显示、隔离”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `getGenerationStreamingIds(stage)`、`removeGenerationStreamingBubble(stage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
// ==================== Generation Streaming Isolation ====================
function getGenerationStreamingIds(stage) {
    // 二段生成使用独立 DOM 标识，避免更新正文流式气泡或把选项写进正文消息。
    if (stage === 'second') {
        return {
            message: 'secondStageStreamingMsg',
            content: 'secondStageStreamingContent',
            cot: 'secondStageStreamingCot'
        };
    }
    return {
        message: 'streamingMsg',
        content: 'streamingContent',
        cot: 'streamingCot'
    };
}

function removeGenerationStreamingBubble(stage) {
    var ids = getGenerationStreamingIds(stage);
    var streamingEl = document.getElementById(ids.message);
    if (streamingEl) streamingEl.remove();
    if (state._streamingDisplayContent) delete state._streamingDisplayContent[stage === 'second' ? 'second' : 'main'];
}
