// ==================== ComfyUI Client Helpers ====================
function makeComfyClientId() {
    return 'opentavern-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
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
