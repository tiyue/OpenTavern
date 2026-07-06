function bindWebLLMSettingsControls() {
    // ===== WebLLM 后端设置（新增） =====
    var backendSel = document.getElementById('inferenceBackend');
    var webllmSection = document.getElementById('webllmModelSection');
    var webllmSel = document.getElementById('webllmModel');

    var currentBackend = state.settings.inferenceBackend || 'remote-api';
    if (backendSel) backendSel.value = currentBackend;

    var currentModel = state.settings.webllmModel || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    if (webllmSel) webllmSel.value = currentModel;

    function toggleWebLLMSection() {
        if (webllmSection) {
            if (backendSel && backendSel.value === 'webllm') {
                webllmSection.classList.remove('hidden');
            } else {
                webllmSection.classList.add('hidden');
            }
        }
    }
    toggleWebLLMSection();

    // 监听后端切换 → 切换到 webllm 时立即弹出重要确认框（并让用户在确认中明确选择要下载哪个模型）
    if (backendSel) {
        backendSel.onchange = null; // 避免重复绑定
        var prevBackend = currentBackend;
        backendSel.addEventListener('change', function() {
            toggleWebLLMSection();

            if (this.value === 'webllm' && prevBackend !== 'webllm') {
                // 立即弹出（此时 webllmModelSection 已可见，用户可以看到/修改要下载的模型）
                // 使用新函数，isModelSwitch=false，让确认框内出现 1B / 3B 两个明确选择按钮
                showWebLLMConfirmForModel(null, false, null, function onCancel() {
                    // 用户取消 → 切回远程
                    backendSel.value = 'remote-api';
                    if (webllmSection) webllmSection.classList.add('hidden');
                    prevBackend = 'remote-api';
                });
            }
            prevBackend = this.value;
        });
    }

    // 监听模型下拉变化：当后端已经是 webllm 时，更换模型要再次弹出进度条确认（下载新模型）
    if (webllmSel) {
        webllmSel.onchange = null;
        webllmSel.addEventListener('change', function() {
            if (backendSel && backendSel.value === 'webllm') {
                var newModel = this.value;
                var loaded = webllmCurrentModel;

                // 只有当和当前已加载的不同，或还没加载时，才弹出确认 + 进度
                if (!loaded || loaded !== newModel) {
                    showWebLLMConfirmForModel(newModel, true, null, function onCancel() {
                        // 取消更换 → 把下拉切回已加载的模型（或默认）
                        webllmSel.value = loaded || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
                    });
                }
            }
        });
    }

    // 显示当前存储后端 + 用量（Phase 1 增强）
    var detectWebGPUBtn = document.getElementById('detectWebGPUDeviceBtn');
    var webgpuDeviceInfo = document.getElementById('webgpuDeviceInfo');
    if (detectWebGPUBtn) {
        detectWebGPUBtn.onclick = function() {
            detectCurrentWebGPUDevice({ statusEl: webgpuDeviceInfo, showDialog: false }).catch(function() {});
        };
    }
    if (webgpuDeviceInfo && webgpuLastDeviceReport) {
        webgpuDeviceInfo.textContent = formatWebGPUDeviceReport(webgpuLastDeviceReport);
    }
}
