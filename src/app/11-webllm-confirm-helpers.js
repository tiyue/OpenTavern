/**
 * 新手导读（文件：11-webllm-confirm-helpers.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、确认、辅助函数”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `getWebLLMConfirmModelId(targetModelId)`、`getWebLLMModelInfo(modelId)`、`formatWebLLMModelSize(sizeMB)`、`buildWebLLMFallbackConfirmMessage(sizeText)`、`buildWebLLMConfirmHtml(modelId, isModelSwitch)`、`cleanupWebLLMConfirmModal(modal, cancelBtn, continueBtn, backdrop)`，以及另外 3 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ===== WebLLM Confirmation Helpers =====
const DEFAULT_WEBLLM_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

function getWebLLMConfirmModelId(targetModelId) {
    return targetModelId ||
        (document.getElementById('webllmModel') && document.getElementById('webllmModel').value) ||
        (state && state.settings && state.settings.webllmModel) ||
        DEFAULT_WEBLLM_MODEL_ID;
}

function getWebLLMModelInfo(modelId) {
    return WEBLLM_MODEL_INFO[modelId] || { label: '所选模型', sizeMB: 1000 };
}

function formatWebLLMModelSize(sizeMB) {
    return sizeMB >= 1000 ? (sizeMB / 1000).toFixed(1) + ' GB' : sizeMB + ' MB';
}

function buildWebLLMFallbackConfirmMessage(sizeText) {
    return '注意：启用/更换浏览器本地模型需要下载模型文件（约 ' + sizeText + '）。\n' +
        '首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。\n是否继续？';
}

function buildWebLLMConfirmHtml(modelId, isModelSwitch) {
    var info = getWebLLMModelInfo(modelId);
    var sizeText = formatWebLLMModelSize(info.sizeMB);
    if (isModelSwitch) {
        return '注意：更换浏览器本地模型需要下载新模型文件（约 <strong>' + sizeText + '</strong>）。<br>' +
            '首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。<br>' +
            '是否继续下载「' + (info.label || modelId) + '」？';
    }
    return '注意：启用浏览器本地模型需要下载模型文件（约 <strong>' + sizeText + '</strong>）。<br>' +
        '首次下载会使用较多流量，建议在 Wi-Fi 环境下进行。<br>' +
        '是否继续？';
}

function cleanupWebLLMConfirmModal(modal, cancelBtn, continueBtn, backdrop) {
    modal.classList.add('hidden');
    if (cancelBtn) cancelBtn.onclick = null;
    if (continueBtn) continueBtn.onclick = null;
    if (backdrop) backdrop.onclick = null;

    var b1 = document.getElementById('webllmChoice1B');
    var b2 = document.getElementById('webllmChoice3B');
    if (b1) b1.onclick = null;
    if (b2) b2.onclick = null;
}

function setWebLLMBackendModel(chosenModel) {
    if (state && state.settings) {
        state.settings.inferenceBackend = 'webllm';
        state.settings.webllmModel = chosenModel;
    }
    var picker = document.getElementById('webllmModel');
    if (picker) picker.value = chosenModel;
}

function startChosenWebLLMModel(chosenModel, onContinue) {
    setWebLLMBackendModel(chosenModel);
    persistState();
    startWebLLMInitialization(chosenModel);
    if (onContinue) onContinue(chosenModel);
}

function wireWebLLMChoiceButtons(cleanup, onContinue) {
    var btn1B = document.getElementById('webllmChoice1B');
    var btn3B = document.getElementById('webllmChoice3B');
    var choose = function(chosenModel) {
        cleanup();
        startChosenWebLLMModel(chosenModel, onContinue);
    };

    if (btn1B) btn1B.onclick = function() { choose('Llama-3.2-1B-Instruct-q4f16_1-MLC'); };
    if (btn3B) btn3B.onclick = function() { choose('Llama-3.2-3B-Instruct-q4f16_1-MLC'); };
}
