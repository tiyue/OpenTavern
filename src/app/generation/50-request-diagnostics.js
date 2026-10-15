var recentRequestDiagnostics = [];

function updateRequestDiagnosticCompletion(diagnostic, completion) {
    if (!diagnostic || !completion) return;
    diagnostic.interrupted = completion.interrupted;
    diagnostic.finishReason = completion.finishReason;
    diagnostic.completionReason = completion.completionReason;
}

function updateRequestDiagnosticError(diagnostic, error, settings) {
    if (!diagnostic) return;
    var message = error && error.message !== undefined ? error.message : error;
    var errorMessage = String(message || '');
    var apiKey = settings && settings.apiKey;
    if (apiKey) errorMessage = errorMessage.split(String(apiKey)).join('[redacted]');
    diagnostic.error = errorMessage;
    if (error && typeof error.ruleName === 'string') {
        var ruleName = error.ruleName;
        if (apiKey) ruleName = ruleName.split(String(apiKey)).join('[redacted]');
        diagnostic.ruleName = ruleName;
    }
}

function captureRequestDiagnostic(payload, beforeMessages, options) {
    options = options || {};
    var settings = options.settings || state.settings;
    var conv = options.conversation || getActiveConv();
    var entries = conv && conv._wiCache && conv._wiCache.result && conv._wiCache.result.entries || [];
    var textLength = payload.messages.reduce(function(count, message) { return count + String(message.content || '').length; }, 0);
    var estimatedTokens = Math.ceil(textLength / 2);
    var capacity = Number(settings.modelContextCapacity) || null;
    var diagnostic = {
        created: new Date().toISOString(), stage: options.stage || 'main', conversationId: conv && conv.id,
        operation: options.operation == null ? null : typeof options.operation === 'object' ? options.operation.sequence : options.operation,
        presetId: settings.activePresetId || null, presetName: settings.sillyTavernPreset && settings.sillyTavernPreset.name || '',
        authorNote: conv ? JSON.parse(JSON.stringify(conv.authorNoteOverride || settings.authorNote || defaultAuthorNote())) : null,
        depthPrompt: conv ? getCharacterDepthPrompt(isGroupChat(conv) ? getCurrentSpeakerCharacter(conv) : conv.character) : null,
        worldBookMode: conv && conv.worldBookMode || 'default', worldBookHits: entries.map(function(entry) { return { uid: entry.uid, comment: entry.comment || '', position: entry.position, source: entry._sourceWorldBookId || 'embedded' }; }),
        validSummaries: conv ? getValidConversationSummaries(conv).map(function(summary) { return { id: summary.id, sources: summary.sourceMessages }; }) : [],
        historyWindow: settings.contextLength, secondStageRecentContext: !!settings.twoStageIncludeRecentContext,
        postProcessing: settings.promptPostProcessing || 'auto', estimatedTokens: estimatedTokens, modelCapacity: capacity,
        capacityNotice: capacity ? (estimatedTokens + (payload.max_tokens || 0) > capacity ? '估算可能超出容量；未自动删减历史' : '估算未超出容量') : '容量未知；估算不能证明请求安全',
        actualMaxTokens: payload.max_tokens, corrected: options.corrected === true,
        beforeMessages: JSON.parse(JSON.stringify(beforeMessages)), payload: JSON.parse(JSON.stringify(payload))
    };
    recentRequestDiagnostics.push(diagnostic);
    if (recentRequestDiagnostics.length > 10) recentRequestDiagnostics.shift();
    return diagnostic;
}
