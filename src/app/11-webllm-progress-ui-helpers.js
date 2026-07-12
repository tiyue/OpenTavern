/**
 * 新手导读（文件：11-webllm-progress-ui-helpers.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、进度、界面、辅助函数”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `getWebLLMProgressElements(无参数)`、`updateWebLLMInitializationProgress(elements, info, report)`、`cleanupWebLLMProgressHandlers(elements)`、`resetWebLLMProgressUI(elements)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== WebLLM Progress UI Helpers ====================
function getWebLLMProgressElements() {
    return {
        modal: document.getElementById('webllmProgressModal'),
        bar: document.getElementById('webllmProgressBar'),
        status: document.getElementById('webllmProgressStatus'),
        percent: document.getElementById('webllmProgressPercent'),
        cancelBtn: document.getElementById('webllmProgressCancelBtn'),
        detectBtn: document.getElementById('webllmDetectDeviceBtn'),
        closeBtn: document.getElementById('webllmProgressCloseBtn'),
        backdrop: document.getElementById('webllmProgressBackdrop')
    };
}

function updateWebLLMInitializationProgress(elements, info, report) {
    if (!elements.modal || elements.modal.classList.contains('hidden')) return;
    var pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
    if (elements.bar) elements.bar.style.width = pct + '%';
    if (elements.percent) elements.percent.textContent = pct + '%';
    var txt = report.text || (pct < 100 ? '\u4e0b\u8f7d/\u521d\u59cb\u5316\u4e2d...' : '\u5b8c\u6210');
    if (elements.status) elements.status.textContent = txt + ' (' + info.label + ')';
}

function cleanupWebLLMProgressHandlers(elements) {
    if (elements.cancelBtn) elements.cancelBtn.onclick = null;
    if (elements.detectBtn) elements.detectBtn.onclick = null;
    if (elements.closeBtn) elements.closeBtn.onclick = null;
    if (elements.backdrop) elements.backdrop.onclick = null;
}

function resetWebLLMProgressUI(elements) {
    if (elements.bar) elements.bar.style.width = '0%';
    if (elements.percent) elements.percent.textContent = '0%';
    if (elements.status) elements.status.textContent = '\u6b63\u5728\u51c6\u5907\u4e0b\u8f7d...';
    elements.modal.classList.remove('hidden');
}
