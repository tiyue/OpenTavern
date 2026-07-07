// ==================== Settings Save WebLLM Form ====================
function readWebLLMSettingsFromForm() {
    var backendSel = document.getElementById('inferenceBackend');
    var webllmSel = document.getElementById('webllmModel');
    if (backendSel) state.settings.inferenceBackend = backendSel.value || 'remote-api';
    if (webllmSel) state.settings.webllmModel = webllmSel.value || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
}
