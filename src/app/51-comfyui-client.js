/**
 * 新手导读（文件：51-comfyui-client.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、客户端”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：主要从 `makeComfyClientId(无参数)`、`waitForComfyPrompt(server, clientId, promptId, timeoutMs)`、`fetchBlobAsDataUrl(url)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
// ==================== ComfyUI Client Helpers ====================
function makeComfyClientId() {
    return 'opentavern-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function waitForComfyPrompt(server, clientId, promptId, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var wsUrl = buildComfyPromptWebSocketUrl(server, clientId);
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
                var res = await fetch(buildComfyPromptHistoryUrl(server, promptId));
                if (!res.ok) return;
                var json = await res.json();
                if (isComfyPromptHistoryComplete(json, promptId)) {
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
                if (isComfyPromptFinishedMessage(msg, promptId)) {
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
