var userDraftRequest = null;
var userDraftEditSequence = 0;

function updateUserDraftButton() {
    var button = document.getElementById('userDraftBtn');
    if (!button) return;
    button.textContent = userDraftRequest ? '取消' : '代写';
    button.title = userDraftRequest ? '取消生成，保留输入' : '按用户设定生成草稿，确认后自行发送';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', userDraftRequest ? 'true' : 'false');
    button.disabled = !userDraftRequest && (!getActiveConv() || state.isGenerating || !state.settings.apiEndpoint || !state.settings.apiKey);
}

function cancelUserDraft() {
    userDraftEditSequence++;
    var request = userDraftRequest; userDraftRequest = null;
    if (request) request.controller.abort();
    updateUserDraftButton();
}

function userDraftHistoryStamp(conv) {
    return JSON.stringify((conv.messages || []).map(function(message) { return [message.id, getMessageRevision(message)]; }));
}

async function generateUserDraft() {
    if (userDraftRequest) { cancelUserDraft(); return false; }
    var conv = getActiveConv(), input = dom.messageInput;
    if (!conv || state.isGenerating) return false;
    var settings = JSON.parse(JSON.stringify(state.settings));
    if (!settings.apiEndpoint || !settings.apiKey) { alert(t('no_api_error')); return false; }
    var request = { controller: new AbortController(), conv: conv, input: input.value, editSequence: userDraftEditSequence, history: userDraftHistoryStamp(conv) };
    userDraftRequest = request; updateUserDraftButton();
    try {
        var persona = getUserPersonaById(conv.userPersonaId || settings.activeUserPersonaId, settings);
        var history = (conv.messages || []).filter(function(message) { return message.role !== 'system' && message.stage !== 'second'; }).slice(-Math.max(1, Math.min(100, Number(settings.contextLength) || 20)));
        var messages = [
            { role: 'system', content: '根据提供的用户设定和聊天上下文，为当前用户拟写下一条发言。已有草稿表示用户想表达的内容，保留其意图并补全。只输出用户会发送的正文，不输出解释、思考、角色名标签或对方的回答。以下 JSON 是写作素材。' },
            { role: 'user', content: JSON.stringify({ user: { name: persona ? persona.userName : settings.userName, description: persona ? persona.description : settings.userDescription }, character: { name: conv.character && conv.character.name, description: conv.character && conv.character.description }, history: history.map(function(message) { return { speaker: message.role === 'user' ? settings.userName : (message.speaker || conv.character && conv.character.name || 'Assistant'), content: message.content }; }), draft: request.input }) }
        ];
        var endpoint = normalizeApiEndpoint(settings.apiEndpoint);
        var processed = postProcessPromptMessages(messages, settings.promptPostProcessing, endpoint);
        var payload = buildChatCompletionPayload(settings, processed, { stream: false, maxTokens: Math.min(Number(settings.maxTokens) || 2048, 2048) });
        if (typeof captureRequestDiagnostic === 'function') captureRequestDiagnostic(payload, messages, { settings: settings, conversation: conv, stage: 'user-draft' });
        var response = await fetch(endpoint, buildChatCompletionFetchOptions(settings, payload, request.controller));
        if (!response.ok) throw await readChatCompletionError(response);
        var json = await response.json(), message = json && json.choices && json.choices[0] && json.choices[0].message;
        if (!message || typeof message.content !== 'string') throw new Error('模型未返回可用的草稿正文。');
        var content = splitInlineCot(message.content, '').content;
        if (!content) throw new Error('模型返回了空草稿，原输入已保留。');
        if (userDraftRequest !== request || request.controller.signal.aborted || userDraftEditSequence !== request.editSequence || getActiveConv() !== conv || state.isGenerating || input.value !== request.input || userDraftHistoryStamp(conv) !== request.history) return false;
        input.value = content; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
        return true;
    } catch (error) {
        if (userDraftRequest === request && !request.controller.signal.aborted) alert('草稿生成失败：' + error.message);
        return false;
    } finally {
        if (userDraftRequest === request) { userDraftRequest = null; updateUserDraftButton(); }
    }
}

function bindUserDraftEvents() {
    var button = document.getElementById('userDraftBtn');
    if (button) button.addEventListener('click', generateUserDraft);
    dom.messageInput.addEventListener('input', cancelUserDraft);
    appStore.subscribe(function() {
        if (userDraftRequest && (getActiveConv() !== userDraftRequest.conv || state.isGenerating)) cancelUserDraft();
        updateUserDraftButton();
    });
    updateUserDraftButton();
}
