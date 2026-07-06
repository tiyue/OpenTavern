// ==================== Generation Stream State Helpers ====================
function beginGenerationStreamState() {
    var controller = new AbortController();
    state.abortController = controller;
    state.isGenerating = true;
    appStore.notify('isGenerating');
    return controller;
}

function finishGenerationStreamState() {
    state.isGenerating = false;
    appStore.notify('isGenerating');
    state.abortController = null;
}
