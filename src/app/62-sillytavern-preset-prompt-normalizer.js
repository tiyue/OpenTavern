// ==================== SillyTavern Preset Prompt Normalizer ====================
function collectSillyTavernPromptRows(src) {
    var promptRows = Array.isArray(src.prompts) ? src.prompts.slice() : [];
    if (promptRows.length > 0) return promptRows;

    ['main_prompt', 'nsfw_prompt', 'jailbreak_prompt', 'impersonation_prompt', 'new_chat_prompt', 'new_group_chat_prompt'].forEach(function(key) {
        if (typeof src[key] === 'string' && src[key].trim()) {
            promptRows.push({
                identifier: key,
                name: key.replace(/_/g, ' '),
                role: 'system',
                content: src[key]
            });
        }
    });
    return promptRows;
}

function normalizeSillyTavernPromptRow(p, idx, orderMap, usedIds) {
    p = p || {};
    var baseId = String(p.identifier || p.id || p.name || ('prompt_' + idx));
    var id = getUniqueSillyTavernPromptId(baseId, idx, usedIds);
    var content = getSillyTavernPromptContent(p);
    var ordered = orderMap[baseId] || orderMap[id] || orderMap[baseId.toLowerCase()] || orderMap[id.toLowerCase()];
    return {
        id: id,
        identifier: String(p.identifier || id),
        name: String(p.name || p.identifier || id),
        role: normalizePromptRole(p.role || (ordered && ordered.role) || 'system'),
        content: content,
        enabled: ordered ? ordered.enabled : p.enabled !== false,
        order: ordered ? ordered.order : idx,
        position: p.position != null ? p.position : (p.injection_position != null ? p.injection_position : (ordered ? ordered.position : undefined)),
        depth: p.depth != null ? p.depth : (p.injection_depth != null ? p.injection_depth : (ordered ? ordered.depth : undefined)),
        injection_position: p.injection_position != null ? p.injection_position : (ordered ? ordered.position : undefined),
        injection_depth: p.injection_depth != null ? p.injection_depth : (ordered ? ordered.depth : undefined)
    };
}

function getUniqueSillyTavernPromptId(baseId, idx, usedIds) {
    var id = baseId;
    if (usedIds[id]) id = id + '_' + idx;
    usedIds[id] = true;
    return id;
}

function getSillyTavernPromptContent(prompt) {
    var content = prompt.content != null
        ? prompt.content
        : (prompt.prompt != null ? prompt.prompt : (prompt.text != null ? prompt.text : prompt.value));
    return String(content || '');
}
