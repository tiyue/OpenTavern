// ==================== Generation Streaming Isolation ====================
function getGenerationStreamingIds(stage) {
    if (stage === 'second') {
        return {
            message: 'secondStageStreamingMsg',
            content: 'secondStageStreamingContent',
            cot: 'secondStageStreamingCot'
        };
    }
    return {
        message: 'streamingMsg',
        content: 'streamingContent',
        cot: 'streamingCot'
    };
}

function removeGenerationStreamingBubble(stage) {
    var ids = getGenerationStreamingIds(stage);
    var streamingEl = document.getElementById(ids.message);
    if (streamingEl) streamingEl.remove();
}
