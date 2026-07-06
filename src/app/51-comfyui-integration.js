// ==================== ComfyUI txt2img ====================
let comfyIsGenerating = false;

async function generateComfyImageForCurrentChat() {
    if (comfyIsGenerating || state.isGenerating) return;
    ensureComfySettings();
    if (!state.settings.comfyEnabled) {
        alert(t('comfy_error_disabled'));
        return;
    }
    var conv = getActiveConv();
    if (!conv) return;

    var server = normalizeComfyServer(state.settings.comfyServer);
    var promptText = buildComfyPromptText(conv);
    var workflow = cloneComfyWorkflow();
    applyComfyPromptToWorkflow(workflow, promptText);

    comfyIsGenerating = true;
    updateInputState();
    if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.classList.add('animate-pulse');

    try {
        var clientId = makeComfyClientId();
        var submitRes = await fetch(server + '/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: clientId })
        });
        if (!submitRes.ok) throw new Error('HTTP ' + submitRes.status + ': ' + (await submitRes.text()).slice(0, 200));
        var submitJson = await submitRes.json();
        var promptId = submitJson.prompt_id;
        if (!promptId) throw new Error(t('comfy_error_prompt_id'));

        await waitForComfyPrompt(server, clientId, promptId, 180000);
        var histRes = await fetch(server + '/history/' + encodeURIComponent(promptId));
        if (!histRes.ok) throw new Error('HTTP ' + histRes.status);
        var history = await histRes.json();
        var image = findComfyOutputImage(history, promptId);
        if (!image) throw new Error(t('comfy_error_no_image'));

        var viewUrl = server + '/view?filename=' + encodeURIComponent(image.filename || '') +
            '&subfolder=' + encodeURIComponent(image.subfolder || '') +
            '&type=' + encodeURIComponent(image.type || 'output');
        var dataUrl = await fetchBlobAsDataUrl(viewUrl);
        var msg = {
            role: 'assistant',
            content: '',
            attachments: [{
                type: 'image',
                source: 'comfyui',
                mime: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png',
                dataUrl: dataUrl,
                prompt: promptText,
                comfyPromptId: promptId,
                filename: image.filename || '',
                createdAt: Date.now()
            }]
        };
        conv.messages.push(msg);
        conv.updated = Date.now();
        conv._lastRenderedVisibleCount = 0;
        persistState();
        renderMessagesOnly();
        renderConversationListOnly();
    } catch (e) {
        alert(t('comfy_error_prefix') + formatComfyError(e));
    } finally {
        comfyIsGenerating = false;
        if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.classList.remove('animate-pulse');
        updateInputState();
    }
}

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

function formatComfyError(e) {
    var msg = (e && e.message) || String(e || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        return t('comfy_error_fetch_hint') + '\n\n' + msg;
    }
    return msg;
}
