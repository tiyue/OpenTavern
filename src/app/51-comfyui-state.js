// ==================== ComfyUI Runtime State ====================
let comfyIsGenerating = false;

function setComfyGenerationActive(active) {
    comfyIsGenerating = !!active;
    updateInputState();
    if (dom.comfyGenerateBtn) {
        dom.comfyGenerateBtn.classList.toggle('animate-pulse', comfyIsGenerating);
    }
}
