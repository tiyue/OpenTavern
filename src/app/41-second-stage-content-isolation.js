// ==================== Second Stage Content Isolation ====================
function stripSecondStageOptionBlocks(content) {
    return String(content || '')
        .replace(/(?:\r?\n)*<options\b[^>]*>[\s\S]*?<\/options>/gi, '')
        .trim();
}

function isolatePrimaryStageContent(content) {
    var text = String(content || '');
    if (!state || !state.settings || !state.settings.twoStageEnabled) return text;
    return stripSecondStageOptionBlocks(text);
}
