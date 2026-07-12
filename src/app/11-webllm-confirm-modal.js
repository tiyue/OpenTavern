/**
 * 新手导读（文件：11-webllm-confirm-modal.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、确认、弹窗”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `getWebLLMConfirmModalElements(无参数)`、`renderWebLLMConfirmModal(elements, modelId, isModelSwitch)`、`bindWebLLMConfirmModalHandlers(elements, cleanup, modelId, onContinue, onCancel)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ===== WebLLM Confirmation Modal Flow =====
function getWebLLMConfirmModalElements() {
    return {
        modal: document.getElementById('webllmConfirmModal'),
        backdrop: document.getElementById('webllmConfirmBackdrop'),
        cancelBtn: document.getElementById('webllmConfirmCancelBtn'),
        continueBtn: document.getElementById('webllmConfirmContinueBtn'),
        textEl: document.getElementById('webllmConfirmText'),
        choiceContainer: document.getElementById('webllmConfirmChoice'),
        genericActions: document.getElementById('webllmConfirmGenericActions')
    };
}

function renderWebLLMConfirmModal(elements, modelId, isModelSwitch) {
    if (elements.textEl) {
        elements.textEl.innerHTML = buildWebLLMConfirmHtml(modelId, isModelSwitch);
    }

    var isFirstEnable = !isModelSwitch;
    if (elements.choiceContainer) {
        elements.choiceContainer.style.display = isFirstEnable ? '' : 'none';
    }
    if (elements.genericActions) {
        elements.genericActions.style.display = isFirstEnable ? 'none' : 'flex';
    }

    elements.modal.classList.remove('hidden');
}

function bindWebLLMConfirmModalHandlers(elements, cleanup, modelId, onContinue, onCancel) {
    if (elements.cancelBtn) {
        elements.cancelBtn.onclick = function() {
            cleanup();
            if (onCancel) onCancel();
        };
    }
    if (elements.backdrop) {
        elements.backdrop.onclick = function() {
            cleanup();
            if (onCancel) onCancel();
        };
    }

    if (elements.continueBtn) {
        elements.continueBtn.onclick = function() {
            cleanup();
            if (onContinue) {
                onContinue(modelId);
            } else {
                startChosenWebLLMModel(modelId);
            }
        };
    }
}
