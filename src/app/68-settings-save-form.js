// ==================== Settings Save Form Facade ====================
// Form readers are split by settings group across 68-settings-save-*-form.js.
function readSettingsFormIntoState() {
    readMainSettingsFromForm();
    readSummarySettingsFromForm();
    readWorldInfoBudgetSettingsFromForm();
    readUiBehaviorSettingsFromForm();
    readSummarizationApiSettingsFromForm();
    readComfySettingsFromForm();
    readCloudSyncSettingsFromForm();
    readWebLLMSettingsFromForm();
}
