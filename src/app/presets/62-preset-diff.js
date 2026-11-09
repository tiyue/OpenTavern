// Read-only structural and text diff between two stored presets or an import candidate.
var PRESET_DIFF_EXCLUDED_METADATA = { id: true, prompts: true, promptOrder: true, regexScripts: true, importedAt: true };
var PRESET_DIFF_KNOWN_PROMPT_FIELDS = {
    id: true, identifier: true, name: true, content: true, enabled: true, role: true,
    position: true, injection_position: true, depth: true, injection_depth: true, order: true
};

function stablePresetDiffValue(value, depth) {
    depth = depth || 0;
    if (depth > 20) return '[depth]';
    if (value === undefined) return '[undefined]';
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(function(item) { return stablePresetDiffValue(item, depth + 1); });
    if (typeof value === 'object') {
        var result = {};
        Object.keys(value).sort().forEach(function(key) { result[key] = stablePresetDiffValue(value[key], depth + 1); });
        return result;
    }
    return value;
}

function presetDiffValuesEqual(left, right) {
    return JSON.stringify(stablePresetDiffValue(left)) === JSON.stringify(stablePresetDiffValue(right));
}

function presetDiffField(object, key) {
    var present = !!object && Object.prototype.hasOwnProperty.call(object, key);
    return { present: present, value: present ? object[key] : undefined };
}

function presetDiffValueLabel(field) {
    if (!field.present) return t('preset_diff_missing');
    if (field.value === '') return t('preset_diff_empty');
    if (field.value === null) return 'null';
    if (typeof field.value === 'object') return JSON.stringify(stablePresetDiffValue(field.value));
    return String(field.value);
}

function presetDiffKey(record, index, prefix) {
    var key = String(record && (record.id || record.identifier) || '');
    return key ? key : '__unmatched_' + prefix + '_' + index;
}

function getPresetDiffPromptOrder(preset) {
    if (typeof getLibraryPromptOrder === 'function') return getLibraryPromptOrder(preset);
    var prompts = Array.isArray(preset && preset.prompts) ? preset.prompts : [];
    var order = Array.isArray(preset && preset.promptOrder) ? preset.promptOrder.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); }) : [];
    var result = [];
    var used = new Set();
    order.forEach(function(item) {
        var key = String(item.identifier || '');
        var prompt = prompts.find(function(candidate) { return String(candidate.identifier || candidate.id) === key; });
        if (prompt && !used.has(prompt)) { used.add(prompt); result.push(prompt); }
    });
    prompts.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function(prompt) {
        if (!used.has(prompt)) { used.add(prompt); result.push(prompt); }
    });
    return result;
}

function comparePresetPrompts(left, right) {
    var leftPrompts = getPresetDiffPromptOrder(left);
    var rightPrompts = getPresetDiffPromptOrder(right);
    var leftMap = Object.create(null), rightMap = Object.create(null);
    leftPrompts.forEach(function(prompt, index) { leftMap[presetDiffKey(prompt, index, 'left')] = { prompt: prompt, index: index }; });
    rightPrompts.forEach(function(prompt, index) { rightMap[presetDiffKey(prompt, index, 'right')] = { prompt: prompt, index: index }; });
    var added = [], removed = [], changed = [];
    leftPrompts.forEach(function(prompt, index) {
        var key = presetDiffKey(prompt, index, 'left');
        var other = rightMap[key];
        if (!other) { removed.push({ key: key, name: String(prompt.name || key), prompt: prompt, textDiff: presetDiffText(String(prompt.content || ''), '') }); return; }
        var fields = [];
        [
            ['content', presetDiffField(prompt, 'content'), presetDiffField(other.prompt, 'content'), presetDiffValuesEqual(presetDiffField(prompt, 'content').value, presetDiffField(other.prompt, 'content').value)],
            ['enabled', { present: true, value: prompt.enabled !== false }, { present: true, value: other.prompt.enabled !== false }, (prompt.enabled !== false) === (other.prompt.enabled !== false)],
            ['role', { present: true, value: normalizePromptRole(prompt.role || 'system') }, { present: true, value: normalizePromptRole(other.prompt.role || 'system') }, normalizePromptRole(prompt.role || 'system') === normalizePromptRole(other.prompt.role || 'system')],
            ['position', { present: true, value: getSillyTavernPresetPlacement(prompt, 'before_history') }, { present: true, value: getSillyTavernPresetPlacement(other.prompt, 'before_history') }, getSillyTavernPresetPlacement(prompt, 'before_history') === getSillyTavernPresetPlacement(other.prompt, 'before_history')],
            ['depth', { present: true, value: parseSillyTavernDepth(prompt) }, { present: true, value: parseSillyTavernDepth(other.prompt) }, parseSillyTavernDepth(prompt) === parseSillyTavernDepth(other.prompt)],
            ['order', { present: true, value: index }, { present: true, value: other.index }, index === other.index]
        ].forEach(function(item) { if (!item[3]) fields.push({ key: item[0], left: item[1], right: item[2] }); });
        Object.keys(prompt).sort().forEach(function(key) {
            if (PRESET_DIFF_KNOWN_PROMPT_FIELDS[key]) return;
            var leftField = presetDiffField(prompt, key), rightField = presetDiffField(other.prompt, key);
            if (!presetDiffValuesEqual(leftField.value, rightField.value) || leftField.present !== rightField.present) fields.push({ key: key, left: leftField, right: rightField });
        });
        Object.keys(other.prompt).sort().forEach(function(key) {
            if (PRESET_DIFF_KNOWN_PROMPT_FIELDS[key] || Object.prototype.hasOwnProperty.call(prompt, key)) return;
            fields.push({ key: key, left: presetDiffField(prompt, key), right: presetDiffField(other.prompt, key) });
        });
        if (fields.length) {
            changed.push({
                key: key, name: String(other.prompt.name || prompt.name || key), fields: fields,
                textDiff: presetDiffValuesEqual(presetDiffField(prompt, 'content').value, presetDiffField(other.prompt, 'content').value)
                    ? null : presetDiffText(String(prompt.content || ''), String(other.prompt.content || ''))
            });
        }
    });
    rightPrompts.forEach(function(prompt, index) {
        var key = presetDiffKey(prompt, index, 'right');
        if (!leftMap[key]) added.push({ key: key, name: String(prompt.name || key), prompt: prompt, textDiff: presetDiffText('', String(prompt.content || '')) });
    });
    return { added: added, removed: removed, changed: changed, leftOrder: leftPrompts.map(function(prompt, index) { return presetDiffKey(prompt, index, 'left'); }), rightOrder: rightPrompts.map(function(prompt, index) { return presetDiffKey(prompt, index, 'right'); }) };
}

function comparePresetRegexScripts(left, right) {
    function key(script, index, prefix) {
        var value = String(script && (script.id || script.scriptName) || '');
        return value ? value : '__unmatched_' + prefix + '_' + index;
    }
    var leftScripts = Array.isArray(left && left.regexScripts) ? left.regexScripts : [];
    var rightScripts = Array.isArray(right && right.regexScripts) ? right.regexScripts : [];
    var leftMap = Object.create(null), rightMap = Object.create(null);
    leftScripts.forEach(function(script, index) { leftMap[key(script, index, 'left')] = script; });
    rightScripts.forEach(function(script, index) { rightMap[key(script, index, 'right')] = script; });
    var added = [], removed = [], changed = [];
    leftScripts.forEach(function(script, index) {
        var scriptKey = key(script, index, 'left');
        var other = rightMap[scriptKey];
        if (!other) { removed.push({ key: scriptKey, name: String(script.scriptName || scriptKey) }); return; }
        var fields = [];
        Object.keys(script).sort().concat(Object.keys(other).sort().filter(function(name) { return !Object.prototype.hasOwnProperty.call(script, name); })).forEach(function(field) {
            var leftField = presetDiffField(script, field), rightField = presetDiffField(other, field);
            if (!presetDiffValuesEqual(leftField.value, rightField.value) || leftField.present !== rightField.present) fields.push({ key: field, left: leftField, right: rightField });
        });
        if (fields.length) changed.push({ key: scriptKey, name: String(other.scriptName || scriptKey), fields: fields });
    });
    rightScripts.forEach(function(script, index) {
        var scriptKey = key(script, index, 'right');
        if (!leftMap[scriptKey]) added.push({ key: scriptKey, name: String(script.scriptName || scriptKey) });
    });
    return { added: added, removed: removed, changed: changed };
}

function comparePresetMetadata(left, right) {
    var changes = [];
    Object.keys(left || {}).sort().concat(Object.keys(right || {}).sort().filter(function(key) { return !Object.prototype.hasOwnProperty.call(left || {}, key); })).forEach(function(key) {
        if (PRESET_DIFF_EXCLUDED_METADATA[key]) return;
        var leftField = presetDiffField(left, key), rightField = presetDiffField(right, key);
        if (!presetDiffValuesEqual(leftField.value, rightField.value) || leftField.present !== rightField.present) changes.push({ key: key, left: leftField, right: rightField });
    });
    return changes;
}

function buildPresetDiff(left, right) {
    return {
        leftName: String(left && left.name || t('preset_diff_left_default')),
        rightName: String(right && right.name || t('preset_diff_right_default')),
        metadata: comparePresetMetadata(left, right),
        prompts: comparePresetPrompts(left, right),
        regex: comparePresetRegexScripts(left, right)
    };
}

function presetDiffTokens(text) {
    return String(text == null ? '' : text).match(/[\u4e00-\u9fff]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_\u4e00-\u9fff]/g) || [];
}

function presetDiffTokenChanges(left, right) {
    var a = presetDiffTokens(left), b = presetDiffTokens(right);
    if (a.length * b.length > 400000) return [{ type: 'del', text: String(left || '') }, { type: 'add', text: String(right || '') }];
    var dp = Array.from({ length: a.length + 1 }, function() { return new Array(b.length + 1).fill(0); });
    for (var i = a.length - 1; i >= 0; i--) {
        for (var j = b.length - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    var result = [], x = 0, y = 0;
    while (x < a.length && y < b.length) {
        if (a[x] === b[y]) { result.push({ type: 'same', text: a[x] }); x++; y++; }
        else if (dp[x + 1][y] >= dp[x][y + 1]) { result.push({ type: 'del', text: a[x++] }); }
        else result.push({ type: 'add', text: b[y++] });
    }
    while (x < a.length) result.push({ type: 'del', text: a[x++] });
    while (y < b.length) result.push({ type: 'add', text: b[y++] });
    return result;
}

function presetDiffLineChanges(left, right) {
    var a = String(left || '').split('\n'), b = String(right || '').split('\n');
    if (a.length > 2000 || b.length > 2000) {
        return [{ type: 'del', text: String(left || '') }, { type: 'add', text: String(right || '') }];
    }
    var dp = Array.from({ length: a.length + 1 }, function() { return new Array(b.length + 1).fill(0); });
    for (var i = a.length - 1; i >= 0; i--) {
        for (var j = b.length - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    var result = [], x = 0, y = 0;
    while (x < a.length && y < b.length) {
        if (a[x] === b[y]) { result.push({ type: 'same', text: a[x] }); x++; y++; }
        else if (dp[x + 1][y] >= dp[x][y + 1]) { result.push({ type: 'del', text: a[x++] }); }
        else result.push({ type: 'add', text: b[y++] });
    }
    while (x < a.length) result.push({ type: 'del', text: a[x++] });
    while (y < b.length) result.push({ type: 'add', text: b[y++] });
    return result;
}

function presetDiffText(left, right) {
    var lines = presetDiffLineChanges(left, right);
    var result = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.type === 'same') { result.push({ type: 'same', text: line.text }); continue; }
        if (line.type === 'del' && lines[i + 1] && lines[i + 1].type === 'add') {
            var words = presetDiffTokenChanges(line.text, lines[i + 1].text);
            result.push({ type: 'del', text: line.text, words: words });
            result.push({ type: 'add', text: lines[i + 1].text, words: words });
            i++;
        } else {
            result.push({ type: line.type, text: line.text, words: presetDiffTokenChanges(line.type === 'del' ? line.text : '', line.type === 'add' ? line.text : '') });
        }
    }
    return result;
}
