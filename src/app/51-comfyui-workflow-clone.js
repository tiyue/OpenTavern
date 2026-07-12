/**
 * 新手导读（文件：51-comfyui-workflow-clone.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、工作流、复制”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：主要从 `cloneComfyWorkflow(无参数)`、`setComfyNodeInput(workflow, nodeId, inputName, value)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
// ==================== ComfyUI Workflow Clone ====================
function cloneComfyWorkflow() {
    ensureComfySettings();
    if (!state.settings.comfyWorkflow || typeof state.settings.comfyWorkflow !== 'object') {
        throw new Error(t('comfy_error_no_workflow'));
    }
    return JSON.parse(JSON.stringify(state.settings.comfyWorkflow));
}

function setComfyNodeInput(workflow, nodeId, inputName, value) {
    if (!nodeId) return false;
    var node = workflow[String(nodeId)];
    if (!node || !node.inputs || !(inputName in node.inputs)) return false;
    node.inputs[inputName] = value;
    return true;
}
