// ===== WebLLM confirmation dialog flow =====
var _prevWebLLMSelectValueForConfirm = 'remote-api';

function showWebLLMConfirmDialog(onContinue, onCancel) {
    showWebLLMConfirmForModel(null, false, onContinue, onCancel);
}

function showWebLLMConfirmForModel(targetModelId, isModelSwitch, onContinue, onCancel) {
    var modal = document.getElementById('webllmConfirmModal');
    var backdrop = document.getElementById('webllmConfirmBackdrop');
    var cancelBtn = document.getElementById('webllmConfirmCancelBtn');
    var continueBtn = document.getElementById('webllmConfirmContinueBtn');
    var textEl = document.getElementById('webllmConfirmText');
    var choiceContainer = document.getElementById('webllmConfirmChoice');
    var genericActions = document.getElementById('webllmConfirmGenericActions');
    var modelId = getWebLLMConfirmModelId(targetModelId);

    if (!modal) {
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

    if (textEl) {
        textEl.innerHTML = buildWebLLMConfirmHtml(modelId, isModelSwitch);
    }

    var isFirstEnable = !isModelSwitch;
    if (choiceContainer) {
        choiceContainer.style.display = isFirstEnable ? '' : 'none';
    }
    if (genericActions) {
        genericActions.style.display = isFirstEnable ? 'none' : 'flex';
    }

    modal.classList.remove('hidden');

    function cleanup() {
        cleanupWebLLMConfirmModal(modal, cancelBtn, continueBtn, backdrop);
    }

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

    if (continueBtn) {
        continueBtn.onclick = function() {
            cleanup();
            if (onContinue) {
                onContinue(modelId);
            } else {
                startChosenWebLLMModel(modelId);
            }
        };
    }

    if (isFirstEnable) {
        wireWebLLMChoiceButtons(cleanup, onContinue);
    }
}
