/**
 * 新手导读（文件：51-comfyui-generation-runtime.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、内容生成、运行流程”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：主要从 `generateComfyImageForCurrentChat(无参数)`、`submitComfyWorkflowAndFindImage(server, workflow)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
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
