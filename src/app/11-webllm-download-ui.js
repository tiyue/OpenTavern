// ===== WebLLM 确认对话框 + 初始化启动 + 进度处理（严格按需求） =====
// - 第一次选择“浏览器本地”后端时：立即弹出重要确认，并在确认框内明确让用户选择要下载哪个模型。
// - 之后在设置中更换模型时：再次弹出（带新模型大小的）确认 + 进度条弹窗。
var _prevWebLLMSelectValueForConfirm = 'remote-api';

function showWebLLMConfirmDialog(onContinue, onCancel) {
    // 兼容旧调用（后端切换时使用）。新逻辑优先用 showWebLLMConfirmForModel
    showWebLLMConfirmForModel(null, false, onContinue, onCancel);
}

/**
 * 新的、更明确的确认函数
 * @param {string|null} targetModelId - 要下载的特定模型（null 时读取当前设置/选择器）
 * @param {boolean} isModelSwitch - 是否是“更换模型”场景（文字略有不同）
 * @param {Function} onContinue - 继续后的回调（可选，内部通常直接启动下载）
 * @param {Function} onCancel
 */
function showWebLLMConfirmForModel(targetModelId, isModelSwitch, onContinue, onCancel) {
    var modal = document.getElementById('webllmConfirmModal');
    var backdrop = document.getElementById('webllmConfirmBackdrop');
    var cancelBtn = document.getElementById('webllmConfirmCancelBtn');
    var continueBtn = document.getElementById('webllmConfirmContinueBtn');
    var textEl = document.getElementById('webllmConfirmText');
    var choiceContainer = document.getElementById('webllmConfirmChoice');
    var genericActions = document.getElementById('webllmConfirmGenericActions');

    if (!modal) {
        // 极端兜底
        var m = targetModelId || (state && state.settings && state.settings.webllmModel) || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        var i = WEBLLM_MODEL_INFO[m] || {sizeMB: 1000};
        var s = i.sizeMB >= 1000 ? (i.sizeMB/1000).toFixed(1)+' GB' : i.sizeMB+' MB';
        showGlassConfirm('注意：启用/更换浏览器本地模型需要下载模型文件（约 ' + s + '）。\n首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。\n是否继续？', { title: '\u542f\u7528\u6d4f\u89c8\u5668\u672c\u5730\u6a21\u578b' }).then(function(ok) {
            if (ok) {
                if (onContinue) onContinue(m);
            } else {
                if (onCancel) onCancel();
            }
        });
        return;
    }

    // 确定目标模型
    var modelId = targetModelId ||
        (document.getElementById('webllmModel') && document.getElementById('webllmModel').value) ||
        (state && state.settings && state.settings.webllmModel) ||
        'Llama-3.2-1B-Instruct-q4f16_1-MLC';

    var info = WEBLLM_MODEL_INFO[modelId] || { label: '所选模型', sizeMB: 1000 };
    var sizeText = info.sizeMB >= 1000 ? (info.sizeMB / 1000).toFixed(1) + ' GB' : info.sizeMB + ' MB';

    // 设置警告文字
    if (textEl) {
        if (isModelSwitch) {
            textEl.innerHTML =
                '注意：更换浏览器本地模型需要下载新模型文件（约 <strong>' + sizeText + '</strong>）。<br>' +
                '首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。<br>' +
                '是否继续下载「' + (info.label || modelId) + '」？';
        } else {
            textEl.innerHTML =
                '注意：启用浏览器本地模型需要下载模型文件（约 <strong>' + sizeText + '</strong>）。<br>' +
                '首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。<br>' +
                '是否继续？';
        }
    }

    // 显示/隐藏选择按钮区域
    var isFirstEnable = !isModelSwitch;

    if (choiceContainer) {
        choiceContainer.style.display = isFirstEnable ? '' : 'none';
    }
    if (genericActions) {
        genericActions.style.display = isFirstEnable ? 'none' : 'flex';
    }

    modal.classList.remove('hidden');

    // 清理函数
    function cleanup() {
        modal.classList.add('hidden');
        if (cancelBtn) cancelBtn.onclick = null;
        if (continueBtn) continueBtn.onclick = null;
        if (backdrop) backdrop.onclick = null;

        // 清理两个模型选择按钮
        var b1 = document.getElementById('webllmChoice1B');
        var b2 = document.getElementById('webllmChoice3B');
        if (b1) b1.onclick = null;
        if (b2) b2.onclick = null;
    }

    // 取消（通用）
    if (cancelBtn) {
        cancelBtn.onclick = function() {
            cleanup();
            if (onCancel) onCancel();
        };
    }
    if (backdrop) {
        backdrop.onclick = function() {
            cleanup();
            if (onCancel) onCancel();
        };
    }

    // 通用 continue（主要用于“更换模型”场景）
    if (continueBtn) {
        continueBtn.onclick = function() {
            cleanup();
            // 使用传入的目标模型
            var chosen = modelId;
            if (onContinue) onContinue(chosen);
            else {
                // 默认行为：设置并启动
                if (state && state.settings) {
                    state.settings.inferenceBackend = 'webllm';
                    state.settings.webllmModel = chosen;
                }
                persistState();
                startWebLLMInitialization(chosen);
            }
        };
    }

    // 仅在“首次启用”时显示明确的模型选择按钮（用户必须在这里挑一个）
    if (isFirstEnable) {
        var btn1B = document.getElementById('webllmChoice1B');
        var btn3B = document.getElementById('webllmChoice3B');

        var doChoose = function(chosenModel) {
            cleanup();
            // 同步到设置里的 model select（如果开着的话）和 state
            var picker = document.getElementById('webllmModel');
            if (picker) picker.value = chosenModel;
            if (state && state.settings) {
                state.settings.inferenceBackend = 'webllm';
                state.settings.webllmModel = chosenModel;
            }
            persistState();

            // 立即开始下载这个模型 + 打开进度条
            startWebLLMInitialization(chosenModel);
            if (onContinue) onContinue(chosenModel);
        };

        if (btn1B) btn1B.onclick = function() { doChoose('Llama-3.2-1B-Instruct-q4f16_1-MLC'); };
        if (btn3B) btn3B.onclick = function() { doChoose('Llama-3.2-3B-Instruct-q4f16_1-MLC'); };
    }
}

function startWebLLMInitialization(forcedModelId) {
    var progressModal = document.getElementById('webllmProgressModal');
    var progressBar = document.getElementById('webllmProgressBar');
    var progressStatus = document.getElementById('webllmProgressStatus');
    var progressPercent = document.getElementById('webllmProgressPercent');
    var cancelBtn = document.getElementById('webllmProgressCancelBtn');
    var detectBtn = document.getElementById('webllmDetectDeviceBtn');
    var closeBtn = document.getElementById('webllmProgressCloseBtn');
    var backdrop = document.getElementById('webllmProgressBackdrop');
    var modelId = forcedModelId || getWebLLMModelId();
    var info = WEBLLM_MODEL_INFO[modelId] || { label: modelId, sizeMB: 0 };
    var abortedByUser = false;

    async function preflightStorageQuota() {
        try {
            const needMB = info.sizeMB || 900;
            const sInfo = await StorageService.getStorageInfo();
            if (sInfo && sInfo.quota != null) {
                const currentUsed = (sInfo.originUsed && sInfo.originUsed > 0)
                    ? sInfo.originUsed
                    : ((sInfo.totalUsed != null) ? sInfo.totalUsed : (sInfo.used || 0));
                const freeEst = sInfo.quota - currentUsed;
                if (freeEst < needMB * 1024 * 1024 * 1.6) {
                    const ok = await showGlassConfirm(`\u5b58\u50a8\u7a7a\u95f4\u53ef\u80fd\u4e0d\u8db3\uff08\u6a21\u578b\u7ea6 ${needMB}MB\uff09\u3002\u5efa\u8bae\u5148\u6e05\u7406 WebLLM \u7f13\u5b58\u6216\u5bfc\u51fa\u5907\u4efd\u518d\u7ee7\u7eed\u3002\n\u4ecd\u8981\u7ee7\u7eed\u5417\uff1f`, { title: '\u5b58\u50a8\u7a7a\u95f4\u63d0\u9192' });
                    if (!ok) {
                        if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
                        if (typeof persistState === 'function') await persistState(true);
                        return false;
                    }
                }
            }
        } catch (_) {}
        return true;
    }

    function updateProgress(report) {
        if (!progressModal || progressModal.classList.contains('hidden')) return;
        var pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressPercent) progressPercent.textContent = pct + '%';
        var txt = report.text || (pct < 100 ? '下载/初始化中...' : '完成');
        if (progressStatus) progressStatus.textContent = txt + ' (' + info.label + ')';
    }

    function cleanupHandlers() {
        if (cancelBtn) cancelBtn.onclick = null;
        if (detectBtn) detectBtn.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (backdrop) backdrop.onclick = null;
    }

    function finish(success, errMsg) {
        if (progressModal) progressModal.classList.add('hidden');
        cleanupHandlers();

        if (!success) {
            if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            persistState();
            var msg = (t('webllm_init_failed') || '本地模型初始化失败：{msg}。已自动切回远程 API。')
                .replace('{msg}', errMsg || '未知错误');
            alert(msg);
        } else {
            try {
                var okMsg = t('webllm_init_success').replace('{model}', info.label);
                console.log('[WebLLM]', okMsg);
            } catch (e) {}
        }
    }

    function doCancel() {
        abortedByUser = true;
        if (progressModal) progressModal.classList.add('hidden');
        if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
        persistState();
        webllmEngine = null;
        webllmCurrentModel = null;
        cleanupHandlers();
    }

    (async () => {
        const okToStart = await preflightStorageQuota();
        if (!okToStart) return;

        if (!progressModal) {
            ensureWebLLMEngine(modelId).then(function() {
                alert(t('webllm_init_success').replace('{model}', modelId));
            }).catch(function(e) {
                alert((t('webllm_init_failed') || 'Failed: {msg}').replace('{msg}', e.message || e));
                if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            });
            return;
        }

        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressStatus) progressStatus.textContent = '正在准备下载...';
        progressModal.classList.remove('hidden');

        if (cancelBtn) cancelBtn.onclick = doCancel;
        if (detectBtn) detectBtn.onclick = function() { detectCurrentWebGPUDevice({ showDialog: true }).catch(function() {}); };
        if (closeBtn) closeBtn.onclick = doCancel;
        if (backdrop) backdrop.onclick = doCancel;

        ensureWebLLMEngine(modelId, updateProgress).then(function() {
            if (!abortedByUser) finish(true);
        }).catch(function(e) {
            if (abortedByUser) return;
            var reason = (e && e.message === 'NO_WEBGPU') ? t('webllm_init_no_webgpu') : (e && e.message) || String(e);
            finish(false, reason);
        });
    })();
}
