function getRegexManagerTarget(layer) {
    if (layer === 'preset') {
        var preset = ensureSillyTavernPresetSettings();
        return { scripts: preset.regexScripts, enabled: preset.regexScriptsEnabled === true, setEnabled: function(value) { preset.regexScriptsEnabled = value; preset.regexScriptsPrompted = true; }, setScripts: function(value) { preset.regexScripts = value; } };
    }
    if (layer === 'character') {
        var character = getActiveConv() && getActiveConv().character;
        if (!character) throw new Error('当前会话没有角色');
        if (!character.extensions) character.extensions = {};
        if (!Array.isArray(character.extensions.regex_scripts)) character.extensions.regex_scripts = [];
        return { scripts: character.extensions.regex_scripts, enabled: character.regexScriptsEnabled === true, setEnabled: function(value) { character.regexScriptsEnabled = value; character.regexScriptsPromptEnabled = value; character.regexScriptsPrompted = true; }, setScripts: function(value) { character.extensions.regex_scripts = value; } };
    }
    if (!Array.isArray(state.settings.globalRegexScripts)) state.settings.globalRegexScripts = [];
    return { scripts: state.settings.globalRegexScripts, enabled: state.settings.globalRegexEnabled === true, setEnabled: function(value) { state.settings.globalRegexEnabled = value; }, setScripts: function(value) { state.settings.globalRegexScripts = value; } };
}

function openRegexScriptEditor(target, script, refresh) {
    var value = script || { id: makeId(), scriptName: '', findRegex: '', replaceString: '', flags: 'g', placement: [2], disabled: false };
    var body = featureField('名称', 'regexName', value.scriptName || value.name || '') + featureField('查找模式', 'regexFind', getRegexScriptFindSource(value), 'textarea') +
        featureField('标志（斜线模式使用模式内标志）', 'regexFlags', value.flags || 'g') + featureField('替换文本', 'regexReplace', getRegexScriptReplacement(value), 'textarea') +
        featureSelect('处理阶段', 'regexPhase', value.promptOnly ? 'prompt' : value.markdownOnly ? 'display' : 'both', [['both', '显示和提示词'], ['display', '仅显示'], ['prompt', '仅提示词']]) +
        '<fieldset class="feature-checks"><legend>处理位置</legend>' + [['USER_INPUT', '用户消息'], ['AI_OUTPUT', '助手消息'], ['WORLD_INFO', '世界书'], ['REASONING', '思考']].map(function(item) {
            return '<label><input type="checkbox" name="regexPlacement" value="' + item[0] + '"' + (regexScriptHasPlacement(value, item[0]) ? ' checked' : '') + '>' + item[1] + '</label>';
        }).join('') + '</fieldset>' + featureField('最小深度（留空不限）', 'regexMin', value.minDepth, 'number', 'min="0" max="1000" step="1"') +
        featureField('最大深度（留空不限）', 'regexMax', value.maxDepth, 'number', 'min="0" max="1000" step="1"') +
        '<label class="feature-check"><input id="regexEnabled" type="checkbox"' + (value.disabled !== true && value.enabled !== false ? ' checked' : '') + '>启用条目</label>' +
        '<label class="feature-check"><input id="regexOnEdit" type="checkbox"' + (value.runOnEdit ? ' checked' : '') + '>编辑后仍处理</label>';
    openFeatureDialog('regexScriptEditor', '正则规则', body, function(dialog) {
        var phase = dialog.querySelector('#regexPhase').value;
        var updated = Object.assign({}, value, {
            scriptName: dialog.querySelector('#regexName').value.trim(), findRegex: dialog.querySelector('#regexFind').value,
            flags: dialog.querySelector('#regexFlags').value.trim(), replaceString: dialog.querySelector('#regexReplace').value,
            placement: Array.from(dialog.querySelectorAll('[name="regexPlacement"]:checked')).map(function(input) { return normalizeRegexSourcePlacement(input.value); }),
            promptOnly: phase === 'prompt', markdownOnly: phase === 'display', disabled: !dialog.querySelector('#regexEnabled').checked,
            enabled: dialog.querySelector('#regexEnabled').checked, runOnEdit: dialog.querySelector('#regexOnEdit').checked,
            minDepth: dialog.querySelector('#regexMin').value === '' ? null : featureNumber(dialog, 'regexMin', 0, 1000, true),
            maxDepth: dialog.querySelector('#regexMax').value === '' ? null : featureNumber(dialog, 'regexMax', 0, 1000, true)
        });
        validateRegexScript(updated);
        if (script) Object.assign(script, updated); else target.scripts.push(updated);
        persistState(true); refresh();
    });
}

function openRegexManager(layer) {
    layer = layer || 'global';
    var dialog = openFeatureDialog('regexManagerDialog', '正则管理', featureSelect('规则层', 'regexLayer', layer, [['global', '全局'], ['preset', '当前预设'], ['character', '当前角色']]) +
        '<p class="feature-hint">执行顺序：全局 → 当前预设 → 当前角色；层内按列表顺序。管理操作即时保存；原文保留。单条超过 500ms 将终止。</p>' +
        '<label class="feature-check"><input id="regexLayerEnabled" type="checkbox">授权本层显示和提示词处理</label><div class="feature-toolbar"><button type="button" data-regex-action="new">新建</button><button type="button" data-regex-action="import">导入</button><button type="button" data-regex-action="export">导出</button><input type="file" data-regex-file accept=".json,application/json" hidden></div><div data-regex-list></div>', null);
    function refresh() {
        try {
            var target = getRegexManagerTarget(layer);
            dialog.querySelector('#regexLayerEnabled').checked = target.enabled;
            dialog.querySelector('[data-regex-list]').innerHTML = target.scripts.map(function(script, index) {
                return '<div class="feature-row"><span><strong>' + escapeHtml(script.scriptName || script.name || '未命名规则') + '</strong><small>' + (script.disabled === true || script.enabled === false ? '关闭' : '启用') + '</small></span>' +
                    '<button type="button" data-regex-edit="' + index + '">编辑</button><button type="button" data-regex-move="' + index + '" data-direction="-1"' + (!index ? ' disabled' : '') + '>上移</button><button type="button" data-regex-move="' + index + '" data-direction="1"' + (index === target.scripts.length - 1 ? ' disabled' : '') + '>下移</button><button type="button" data-regex-delete="' + index + '">删除</button></div>';
            }).join('') || '<p class="feature-hint">暂无规则。</p>';
        } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
    }
    dialog.querySelector('#regexLayer').onchange = function(event) { layer = event.target.value; refresh(); };
    dialog.querySelector('#regexLayerEnabled').onchange = function(event) {
        try { var target = getRegexManagerTarget(layer); if (event.target.checked) target.scripts.forEach(validateRegexScript); target.setEnabled(event.target.checked); persistState(true); }
        catch (error) { event.target.checked = false; dialog.querySelector('.feature-error').textContent = error.message; }
    };
    dialog.querySelector('[data-regex-file]').onchange = async function(event) {
        try {
            var file = event.target.files[0];
            if (!file) return;
            if (file.size > 2000000) throw new Error('导入文件超过 2MB');
            var raw = JSON.parse(await file.text()), scripts = Array.isArray(raw) ? raw : raw.regex_scripts;
            if (!Array.isArray(scripts) || scripts.length > 100) throw new Error('正则文件格式无效或超过 100 条');
            scripts.forEach(validateRegexScript);
            var target = getRegexManagerTarget(layer);
            target.setScripts(target.scripts.concat(scripts)); target.setEnabled(false);
            persistState(true); refresh();
        } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
        event.target.value = '';
    };
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        try {
            var target = getRegexManagerTarget(layer), action = button.dataset.regexAction;
            if (action === 'new') openRegexScriptEditor(target, null, refresh);
            if (action === 'import') dialog.querySelector('[data-regex-file]').click();
            if (action === 'export') downloadJsonFile({ regex_scripts: target.scripts }, 'opentavern-regex.json');
            if (button.dataset.regexEdit != null) openRegexScriptEditor(target, target.scripts[Number(button.dataset.regexEdit)], refresh);
            if (button.dataset.regexDelete != null && confirm('删除此规则？')) { target.scripts.splice(Number(button.dataset.regexDelete), 1); persistState(true); refresh(); }
            if (button.dataset.regexMove != null) {
                var from = Number(button.dataset.regexMove), to = from + Number(button.dataset.direction);
                if (to >= 0 && to < target.scripts.length) { var moved = target.scripts.splice(from, 1)[0]; target.scripts.splice(to, 0, moved); persistState(true); refresh(); }
            }
        } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
    });
    refresh();
}
