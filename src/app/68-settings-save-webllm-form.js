// ==================== Settings Save WebLLM Form ====================
function readWebLLMSettingsFromForm() {
    var backendSel = document.getElementById('inferenceBackend');
    var webllmSel = document.getElementById('webllmModel');
    if (backendSel) state.settings.inferenceBackend = readControlValueOr(backendSel, 'remote-api');
    if (webllmSel) state.settings.webllmModel = readControlValueOr(webllmSel, 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
}
