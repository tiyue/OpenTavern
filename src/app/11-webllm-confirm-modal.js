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
