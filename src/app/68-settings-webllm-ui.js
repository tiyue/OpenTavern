/**
 * 新手导读（文件：68-settings-webllm-ui.js）
 *
 * 负责什么：这是“设置界面”中的“设置、浏览器本地大模型、界面”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `bindWebLLMSettingsControls(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// WebLLM 设置绑定：连接模型选择、设备检测、缓存和初始化控件。
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
