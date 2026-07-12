/**
 * 新手导读（文件：41-prompt-outlet-resolution.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、提示词出口、解析”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `resolvePromptOutletPlaceholders(apiMessages, outlets, charName, userName)`、`replacePromptMessagePlaceholders(apiMessages, charName, userName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// Prompt outlet 解析：将预设占位消息替换并插入最终 API 消息序列。
function resolvePromptOutletPlaceholders(apiMessages, outlets, charName, userName) {
    outlets = outlets || {};
    if (Object.keys(outlets).length === 0) return apiMessages;
    apiMessages.forEach(function(msg) {
        if (msg.content && msg.content.includes('{{outlet::')) {
            msg.content = msg.content.replace(/\{\{outlet::([^}]+)\}\}/gi, function(match, outletName) {
                var name = outletName.trim();
                var entries = outlets[name];
                if (!entries || entries.length === 0) return '';
                return entries.map(function(e) {
                    return replacePlaceholders(e.content || '', charName, userName);
                }).join('\n\n');
            });
        }
    });
    return apiMessages;
}

function replacePromptMessagePlaceholders(apiMessages, charName, userName) {
    return apiMessages.map(function(m) {
        return { role: m.role, content: replacePlaceholders(m.content, charName, userName) };
    });
}
