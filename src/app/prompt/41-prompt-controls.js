function defaultAuthorNote() {
    return { enabled: false, content: '', role: 'system', position: 'in_chat', depth: 4, interval: 1 };
}

function validateAuthorNote(note) {
    validatePresetPrompt(Object.assign({}, note, { name: "Author's Note" }));
    if (!Number.isInteger(note.interval) || note.interval < 1 || note.interval > 1000) throw new Error('插入间隔须为 1–1000 的整数');
    return note;
}

function getEffectiveAuthorNote(conv, settings) {
    settings = settings || state.settings;
    return conv && conv.authorNoteOverride != null ? conv.authorNoteOverride : settings.authorNote || defaultAuthorNote();
}

function getCharacterDepthPrompt(character) {
    var raw = character && (character.depth_prompt || character.extensions && character.extensions.depth_prompt);
    if (!raw || typeof raw !== 'object') return null;
    var depth = Number(raw.depth == null ? 4 : raw.depth);
    return { content: String(raw.prompt || raw.content || ''), role: normalizePromptRole(raw.role == null ? 'system' : raw.role), depth: Number.isInteger(depth) && depth >= 0 ? Math.min(depth, 1000) : 4 };
}

function insertAdditionalPromptMessages(messages, conv, character, wiByPos, charName, userName, settings) {
    var note = getEffectiveAuthorNote(conv, settings);
    var count = conv.messages.filter(function(message) { return message.role !== 'system'; }).length;
    if (note && note.enabled === true && String(note.content || '').trim() && count % (Number(note.interval) || 1) === 0) {
        var top = (wiByPos[WI_POS.TOP_AN] || []).map(function(entry) { return entry.content; });
        var bottom = (wiByPos[WI_POS.BOTTOM_AN] || []).map(function(entry) { return entry.content; });
        var content = top.concat([note.content], bottom).filter(Boolean).join('\n\n');
        var message = { role: normalizePromptRole(note.role), content: replacePlaceholders(content, charName, userName) };
        if (note.position === 'before_history') {
            messages.splice(messages.length && messages[0].role === 'system' ? 1 : 0, 0, message);
        } else if (note.position === 'after_history') messages.push(message);
        else insertMessagesAtDepth(messages, [Object.assign({}, message, { depth: note.depth })], charName, userName);
    }
    var depthPrompt = getCharacterDepthPrompt(character);
    if (depthPrompt && depthPrompt.content.trim()) insertMessagesAtDepth(messages, [depthPrompt], charName, userName);
    return messages;
}

function postProcessPromptMessages(messages, mode, endpoint) {
    var copy = messages.map(function(message) { return { role: message.role, content: String(message.content || '') }; });
    mode = mode || 'auto';
    if (mode === 'auto') return shouldUseOllamaCompat(endpoint) ? normalizeMessagesForOllamaCompatibility(copy) : copy;
    if (mode === 'system_to_user' || mode === 'user_last') {
        var seen = false;
        copy.forEach(function(message) {
            if (message.role === 'system' && seen) message.role = 'user';
            if (message.role !== 'system') seen = true;
        });
    }
    if (mode === 'merge' || mode === 'system_to_user' || mode === 'user_last') {
        copy = copy.reduce(function(result, message) {
            var last = result[result.length - 1];
            if (last && last.role === message.role) last.content += '\n\n' + message.content;
            else result.push(message);
            return result;
        }, []);
    }
    if (mode === 'user_last' && copy.length && copy[copy.length - 1].role !== 'user') copy[copy.length - 1].role = 'user';
    return copy;
}

function applyExplicitReasoningParameters(payload, settings, summary) {
    var effort = settings[summary ? 'summaryReasoningEffort' : 'reasoningEffort'];
    var thinking = settings[summary ? 'summaryThinking' : 'thinking'];
    if (effort) payload.reasoning_effort = effort;
    if (thinking && typeof thinking === 'object' && !Array.isArray(thinking)) payload.thinking = JSON.parse(JSON.stringify(thinking));
    return payload;
}
