// ==================== Settings Integration Event Bindings ====================
function bindSettingsIntegrationEvents() {
    if (dom.stPresetImportBtn) dom.stPresetImportBtn.addEventListener('click', function() {
        if (dom.stPresetImportFile) dom.stPresetImportFile.click();
    });
    if (dom.stPresetImportFile) dom.stPresetImportFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importSillyTavernPresetFile(file);
    });
    if (dom.stPresetExportBtn) dom.stPresetExportBtn.addEventListener('click', exportSillyTavernPreset);
    if (dom.stPresetDeleteBtn) dom.stPresetDeleteBtn.addEventListener('click', deleteSillyTavernPreset);

    if (dom.comfyImportWorkflowBtn) dom.comfyImportWorkflowBtn.addEventListener('click', function() {
        if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.click();
    });
    if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importComfyWorkflowFile(file);
    });
    if (dom.comfyTestBtn) dom.comfyTestBtn.addEventListener('click', testComfyConnection);
}
