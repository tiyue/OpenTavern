/**
 * 新手导读（文件：41-second-stage-content-isolation.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“第二阶段、内容、隔离”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `stripSecondStageOptionBlocks(content)`、`isolatePrimaryStageContent(content)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// ==================== Second Stage Content Isolation ====================
function stripSecondStageOptionBlocks(content) {
    return String(content || '')
        .replace(/(?:\r?\n)*<options\b[^>]*>[\s\S]*?<\/options>/gi, '')
        .replace(/(?:\r?\n)*<options\b[^>]*>[\s\S]*$/gi, '')
        .trim();
}

function isolatePrimaryStageContent(content) {
    var text = String(content || '');
    if (!state || !state.settings || !state.settings.twoStageEnabled) return text;
    return stripSecondStageOptionBlocks(text);
}
