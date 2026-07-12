/**
 * 新手导读（文件：51-comfyui-settings.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、设置”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：主要从 `ensureComfySettings(无参数)`、`normalizeComfyServer(url)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
// ==================== ComfyUI Settings ====================
function ensureComfySettings() {
    if (!state.settings) state.settings = defaultSettings();
    var defs = defaultSettings();
    [
        'comfyEnabled',
        'comfyServer',
        'comfyWorkflow',
        'comfyWorkflowName',
        'comfyPositiveNodeId',
        'comfyNegativeNodeId',
        'comfySeedNodeId',
        'comfyNegativePrompt',
        'comfyPromptTemplate'
    ].forEach(function(key) {
        if (state.settings[key] === undefined || state.settings[key] === null) {
            state.settings[key] = defs[key];
        }
    });
    state.settings.comfyServer = String(state.settings.comfyServer || defs.comfyServer);
    state.settings.comfyWorkflowName = String(state.settings.comfyWorkflowName || '');
    state.settings.comfyPositiveNodeId = String(state.settings.comfyPositiveNodeId || '');
    state.settings.comfyNegativeNodeId = String(state.settings.comfyNegativeNodeId || '');
    state.settings.comfySeedNodeId = String(state.settings.comfySeedNodeId || '');
    state.settings.comfyNegativePrompt = String(state.settings.comfyNegativePrompt || '');
    state.settings.comfyPromptTemplate = String(state.settings.comfyPromptTemplate || defs.comfyPromptTemplate);
    return state.settings;
}

function normalizeComfyServer(url) {
    url = String(url || '').trim() || 'http://127.0.0.1:8188';
    return url.replace(/\/+$/, '');
}
