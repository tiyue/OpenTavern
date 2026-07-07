// ==================== Settings Advanced Hydration Helpers ====================
function hydrateCheckboxControl(control, value) {
    if (control) control.checked = !!value;
}

function hydrateCheckboxControlDefaultOn(control, value) {
    if (control) control.checked = value !== false;
}

function hydrateValueControl(control, value) {
    if (control) control.value = value;
}

function hydrateValueAndLabelControl(control, labelControl, value) {
    if (control) control.value = value;
    if (labelControl) labelControl.textContent = value;
}

function bindDefaultPromptRestoreButton(button, promptControl, defaultPrompt) {
    if (!button || !promptControl) return;
    button.onclick = function() {
        promptControl.value = defaultPrompt;
        state.settings.twoStageSystemPrompt = defaultPrompt;
        persistState(true);
    };
}
