/**
 * 新手导读（文件：62-sillytavern-preset-prompt-normalizer.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、提示词、规范化”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `collectSillyTavernPromptRows(src)`、`normalizeSillyTavernPromptRow(p, idx, orderMap, usedIds)`、`getUniqueSillyTavernPromptId(baseId, idx, usedIds)`、`getSillyTavernPromptContent(prompt)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
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
