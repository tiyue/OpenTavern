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
