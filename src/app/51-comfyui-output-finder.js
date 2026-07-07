// ==================== ComfyUI Output Finder ====================
function findComfyOutputImage(history, promptId) {
    var item = history && (history[promptId] || history);
    var outputs = item && item.outputs ? item.outputs : {};
    var nodeIds = Object.keys(outputs || {});
    for (var i = 0; i < nodeIds.length; i++) {
        var images = outputs[nodeIds[i]] && outputs[nodeIds[i]].images;
        if (Array.isArray(images) && images.length > 0) return images[0];
    }
    return null;
}
