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
