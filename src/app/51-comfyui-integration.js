// ==================== ComfyUI txt2img ====================
let comfyIsGenerating = false;

function normalizeComfyServer(url) {
    url = String(url || '').trim() || 'http://127.0.0.1:8188';
    return url.replace(/\/+$/, '');
}

function makeComfyClientId() {
    return 'opentavern-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

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

function buildComfyPromptText(conv) {
    ensureComfySettings();
    var latestAssistant = '';
    if (conv && Array.isArray(conv.messages)) {
        for (var i = conv.messages.length - 1; i >= 0; i--) {
            if (conv.messages[i] && conv.messages[i].role === 'assistant' && conv.messages[i].content) {
                latestAssistant = conv.messages[i].content;
                break;
            }
        }
    }
    var inputText = dom.messageInput ? dom.messageInput.value.trim() : '';
    var scene = inputText || latestAssistant || (conv && conv.title) || '';
    var character = '';
    if (conv) {
        if (isGroupChat(conv)) {
            character = getGroupMembers(conv).map(function(m) {
                return m && m.character ? m.character.name : '';
            }).filter(Boolean).join(', ');
        } else if (conv.character && conv.character.name) {
            character = conv.character.name;
        }
    }
    var text = state.settings.comfyPromptTemplate || '{{scene}}';
    text = text.replace(/\{\{scene\}\}/gi, scene)
        .replace(/\{\{last_assistant\}\}/gi, latestAssistant)
        .replace(/\{\{input\}\}/gi, inputText)
        .replace(/\{\{char\}\}/gi, character)
        .replace(/\{\{user\}\}/gi, state.settings.userName || 'User');
    return text.trim() || scene || character || 'roleplay scene';
}

function applyComfyPromptToWorkflow(workflow, promptText) {
    ensureComfySettings();
    var posId = String(state.settings.comfyPositiveNodeId || '').trim();
    var negId = String(state.settings.comfyNegativeNodeId || '').trim();
    var seedId = String(state.settings.comfySeedNodeId || '').trim();
    if (!setComfyNodeInput(workflow, posId, 'text', promptText)) {
        throw new Error(t('comfy_error_positive_node'));
    }
    if (negId) setComfyNodeInput(workflow, negId, 'text', state.settings.comfyNegativePrompt || '');
    if (seedId) {
        var node = workflow[seedId];
        if (node && node.inputs) {
            if ('seed' in node.inputs) node.inputs.seed = Math.floor(Math.random() * 9007199254740991);
            else if ('noise_seed' in node.inputs) node.inputs.noise_seed = Math.floor(Math.random() * 9007199254740991);
        }
    }
}

function waitForComfyPrompt(server, clientId, promptId, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var wsUrl = server.replace(/^http/i, 'ws') + '/ws?clientId=' + encodeURIComponent(clientId);
        var ws;
        var done = false;
        var pollTimer = null;
        var timer = setTimeout(function() {
            cleanup();
            reject(new Error(t('comfy_error_timeout')));
        }, timeoutMs || 180000);

        function cleanup() {
            done = true;
            clearTimeout(timer);
            if (pollTimer) clearInterval(pollTimer);
            try { if (ws) ws.close(); } catch (_) {}
        }

        async function pollHistory() {
            if (done) return;
            try {
                var res = await fetch(server + '/history/' + encodeURIComponent(promptId));
                if (!res.ok) return;
                var json = await res.json();
                if (json && (json[promptId] || json.outputs)) {
                    cleanup();
                    resolve();
                }
            } catch (_) {}
        }
        pollTimer = setInterval(pollHistory, 2500);

        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            cleanup();
            reject(e);
            return;
        }

        ws.onerror = function() {
            if (!done) {
                cleanup();
                reject(new Error(t('comfy_error_ws')));
            }
        };
        ws.onmessage = function(ev) {
            if (done || typeof ev.data !== 'string') return;
            try {
                var msg = JSON.parse(ev.data);
                if (msg.type === 'executing' && msg.data && msg.data.prompt_id === promptId && msg.data.node === null) {
                    cleanup();
                    resolve();
                }
            } catch (_) {}
        };
    });
}

function findComfyOutputImage(history, promptId) {
    var item = history && (history[promptId] || history);
    var outputs = item && item.outputs ? item.outputs : {};
    var nodeIds = Object.keys(outputs || {});
    for (var i = 0; i < nodeIds.length; i++) {
        var images = outputs[nodeIds[i]] && outputs[nodeIds[i]].images;
        if (Array.isArray(images) && images.length > 0) return images[0];
    }
    return null;
}

async function fetchBlobAsDataUrl(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var blob = await res.blob();
    return await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

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
