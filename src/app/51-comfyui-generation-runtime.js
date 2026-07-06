// ==================== ComfyUI Generation Runtime ====================
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

    setComfyGenerationActive(true);

    try {
        var output = await submitComfyWorkflowAndFindImage(server, workflow);
        var dataUrl = await loadComfyOutputImageDataUrl(server, output.image);
        appendComfyImageMessage(
            conv,
            createComfyImageMessage(dataUrl, promptText, output.promptId, output.image)
        );
    } catch (e) {
        alert(t('comfy_error_prefix') + formatComfyError(e));
    } finally {
        setComfyGenerationActive(false);
    }
}

async function submitComfyWorkflowAndFindImage(server, workflow) {
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

    return { promptId: promptId, image: image };
}
