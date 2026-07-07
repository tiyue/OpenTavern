// ===== WebLLM confirmation dialog flow =====
var _prevWebLLMSelectValueForConfirm = 'remote-api';

function showWebLLMConfirmDialog(onContinue, onCancel) {
    showWebLLMConfirmForModel(null, false, onContinue, onCancel);
}

function showWebLLMConfirmForModel(targetModelId, isModelSwitch, onContinue, onCancel) {
    var elements = getWebLLMConfirmModalElements();
    var modelId = getWebLLMConfirmModelId(targetModelId);

    if (!elements.modal) {
        var info = getWebLLMModelInfo(modelId);
        showGlassConfirm(buildWebLLMFallbackConfirmMessage(formatWebLLMModelSize(info.sizeMB)), {
            title: t('webllm_confirm_title') || '启用浏览器本地模型'
        }).then(function(ok) {
            if (ok) {
                if (onContinue) onContinue(modelId);
            } else if (onCancel) {
                onCancel();
            }
        });
        return;
    }

    renderWebLLMConfirmModal(elements, modelId, isModelSwitch);

    function cleanup() {
        cleanupWebLLMConfirmModal(elements.modal, elements.cancelBtn, elements.continueBtn, elements.backdrop);
    }
    bindWebLLMConfirmModalHandlers(elements, cleanup, modelId, onContinue, onCancel);

    if (!isModelSwitch) {
        wireWebLLMChoiceButtons(cleanup, onContinue);
    }
}
