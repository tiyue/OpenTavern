/**
 * 新手导读（文件：51-comfyui-workflow-import-ui.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、工作流、导入、界面”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：主要从 `importComfyWorkflowFile(file)`、`updateComfyWorkflowStatus(无参数)`、`testComfyConnection(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
// ==================== ComfyUI Workflow Import UI ====================
async function importComfyWorkflowFile(file) {
    if (!file) return;
    try {
        var text = await file.text();
        var json = JSON.parse(text);
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(t('comfy_error_workflow_invalid'));
        ensureComfySettings();
        state.settings.comfyWorkflow = json;
        state.settings.comfyWorkflowName = file.name || 'workflow.json';
        persistState(true);
        updateComfyWorkflowStatus();
        alert(t('settings_comfy_import_success'));
    } catch (e) {
        alert(t('comfy_error_prefix') + formatComfyError(e));
    } finally {
        if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.value = '';
    }
}

function updateComfyWorkflowStatus() {
    if (!dom.comfyWorkflowStatus) return;
    ensureComfySettings();
    if (state.settings.comfyWorkflow) {
        var count = Object.keys(state.settings.comfyWorkflow).length;
        dom.comfyWorkflowStatus.textContent = (state.settings.comfyWorkflowName || 'workflow.json') + ' · ' + count + ' nodes';
        dom.comfyWorkflowStatus.style.color = '#86efac';
    } else {
        dom.comfyWorkflowStatus.textContent = t('settings_comfy_no_workflow');
        dom.comfyWorkflowStatus.style.color = '';
    }
}

async function testComfyConnection() {
    ensureComfySettings();
    var server = normalizeComfyServer(dom.comfyServer ? dom.comfyServer.value : state.settings.comfyServer);
    try {
        var res = await fetch(server + '/system_stats');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        alert(t('settings_comfy_test_success'));
    } catch (e) {
        alert(t('comfy_error_prefix') + (e.message || e));
    }
}
