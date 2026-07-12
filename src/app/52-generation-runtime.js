/**
 * 新手导读（文件：52-generation-runtime.js）
 *
 * 负责什么：这是“回复生成主流程”中的“内容生成、运行流程”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `completeGenerationTurn(conv)`、`handlePrimaryAssistantComplete(fullContent, fullCot)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
// ==================== Generation Turn Runtime ====================
function completeGenerationTurn(conv) {
    if (!conv) return;
    if (isGroupChat(conv)) {
        conv._nextGroupSpeaker = getNextGroupSpeaker(conv);
    } else {
        delete conv._nextGroupSpeaker;
    }
    conv.updated = Date.now();
    persistState();
    state.isGenerating = false;
    appStore.notify('isGenerating');
    renderTokenBar();
    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 500);
    }
}

function handlePrimaryAssistantComplete(fullContent, fullCot) {
    removeGenerationStreamingBubble('main');
    fullContent = isolatePrimaryStageContent(fullContent);
    var conv = getActiveConv();
    if (!conv || !fullContent) {
        state.isGenerating = false;
        appStore.notify('isGenerating');
        return;
    }

    var speakerForMsg = isGroupChat(conv)
        ? (conv._nextGroupSpeaker ? conv._nextGroupSpeaker.name : getCurrentGeneratingSpeakerName(conv))
        : null;
    var firstStageMsg = finishAssistantMessage(conv, fullContent, speakerForMsg, 'main', null, fullCot);

    if (state.settings.twoStageEnabled && firstStageMsg) {
        runSecondStageGeneration(firstStageMsg, function() {
            completeGenerationTurn(conv);
        });
    } else {
        completeGenerationTurn(conv);
    }
}
