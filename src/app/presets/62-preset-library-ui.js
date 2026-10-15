function renderPresetLibrarySelector() {
    var library = ensurePresetLibrary();
    var container = document.getElementById('presetLibraryControls');
    if (!container) {
        container = document.createElement('div');
        container.id = 'presetLibraryControls';
        container.className = 'feature-inline';
        dom.stPresetStatus.before(container);
    }
    container.innerHTML = '<label for="presetLibrarySelect">当前预设</label><select id="presetLibrarySelect">' +
        library.map(function(preset) { return '<option value="' + escapeHtml(preset.id) + '"' + (preset.id === state.settings.activePresetId ? ' selected' : '') + '>' + escapeHtml(preset.name || '未命名') + '</option>'; }).join('') +
        '</select><button type="button" id="managePresetLibrary">管理库</button>';
    container.querySelector('select').onchange = function(event) { selectLibraryPreset(event.target.value); };
    container.querySelector('button').onclick = openPresetLibrary;
}

function openPresetPromptEditor(preset, prompt) {
    var value = prompt || { id: makeId(), name: '', content: '', enabled: true, role: 'system', position: 'before_history', depth: 4 };
    var body = featureField('名称', 'presetPromptName', value.name) + featureField('正文', 'presetPromptContent', value.content, 'textarea') +
        featureSelect('消息角色', 'presetPromptRole', value.role, [['system', 'system'], ['user', 'user'], ['assistant', 'assistant']]) +
        featureSelect('位置', 'presetPromptPosition', getSillyTavernPresetPlacement(value, 'before_history'), [['before_history', '历史之前'], ['after_history', '历史之后'], ['in_chat', '指定深度']]) +
        featureField('深度（从消息数组末尾计数）', 'presetPromptDepth', parseSillyTavernDepth(value), 'number', 'min="0" max="1000" step="1"') +
        '<label class="feature-check"><input id="presetPromptEnabled" type="checkbox"' + (value.enabled !== false ? ' checked' : '') + '>启用</label>';
    openFeatureDialog('presetPromptEditor', '预设条目', body, function(dialog) {
        var updated = Object.assign({}, value, {
            name: dialog.querySelector('#presetPromptName').value.trim(), content: dialog.querySelector('#presetPromptContent').value,
            role: dialog.querySelector('#presetPromptRole').value, position: dialog.querySelector('#presetPromptPosition').value,
            depth: featureNumber(dialog, 'presetPromptDepth', 0, 1000, true), enabled: dialog.querySelector('#presetPromptEnabled').checked
        });
        validatePresetPrompt(updated);
        updated.injection_position = updated.position;
        updated.injection_depth = updated.depth;
        if (!prompt) { updated.order = preset.prompts.length; preset.prompts.push(updated); }
        else Object.assign(prompt, updated);
        var orderItem = preset.promptOrder.find(function(item) { return item.identifier === (value.identifier || value.id); });
        if (orderItem) Object.assign(orderItem, { enabled: updated.enabled, role: updated.role, position: updated.position, depth: updated.depth });
        persistState(true);
        renderSillyTavernPresetSettings();
        refreshPresetLibraryDialog();
    });
}

function refreshPresetLibraryDialog() {
    var dialog = document.getElementById('presetLibraryDialog');
    if (!dialog) return;
    var preset = ensureSillyTavernPresetSettings();
    var list = dialog.querySelector('[data-preset-prompts]');
    list.innerHTML = getLibraryPromptOrder(preset).map(function(prompt, index) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(prompt.name) + '</strong><small>' + (prompt.enabled !== false ? '启用' : '关闭') + ' · ' + escapeHtml(prompt.role) + ' · 估算 ' + Math.ceil(String(prompt.content).length / 2) + ' Token</small></span>' +
            '<button type="button" data-prompt-edit="' + escapeHtml(prompt.id) + '">编辑</button><button type="button" data-prompt-move="' + escapeHtml(prompt.id) + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>上移</button>' +
            '<button type="button" data-prompt-move="' + escapeHtml(prompt.id) + '" data-direction="1"' + (index === preset.prompts.length - 1 ? ' disabled' : '') + '>下移</button><button type="button" data-prompt-delete="' + escapeHtml(prompt.id) + '">删除</button></div>';
    }).join('') || '<p class="feature-hint">暂无条目，可新建或导入。</p>';
    dialog.querySelector('#libraryPresetName').value = preset.name || '';
}

function openPresetLibrary() {
    var preset = ensureSillyTavernPresetSettings();
    var dialog = openFeatureDialog('presetLibraryDialog', '预设库', '<p class="feature-hint">库管理和导入即时保存。</p>' +
        featureField('当前预设名称', 'libraryPresetName', preset.name) +
        '<div class="feature-toolbar"><button type="button" data-library-action="rename">改名</button><button type="button" data-library-action="new">新建预设</button><button type="button" data-library-action="copy">复制预设</button>' +
        '<button type="button" data-library-action="delete">删除预设</button><button type="button" data-library-action="export">导出整库</button><button type="button" data-library-action="regex">预设正则</button><button type="button" data-library-action="prompt">新建条目</button></div><div data-preset-prompts></div>', null);
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        var current = ensureSillyTavernPresetSettings();
        var action = button.dataset.libraryAction;
        if (action === 'new') addLibraryPreset(Object.assign(defaultSillyTavernPreset(), { name: '新预设' }));
        if (action === 'copy') addLibraryPreset(Object.assign(JSON.parse(JSON.stringify(current)), { name: (current.name || '预设') + ' 副本' }));
        if (action === 'rename') {
            var name = dialog.querySelector('#libraryPresetName').value.trim();
            if (!name) { dialog.querySelector('.feature-error').textContent = '名称不能为空'; return; }
            current.name = name; persistState(true); renderSillyTavernPresetSettings();
        }
        if (action === 'delete' && confirm('删除当前预设？')) removeLibraryPreset(current.id);
        if (action === 'export') downloadJsonFile({ type: 'opentavern-preset-library', activePresetId: state.settings.activePresetId, presets: ensurePresetLibrary() }, 'opentavern-presets.json');
        if (action === 'regex') openRegexManager('preset');
        if (action === 'prompt') openPresetPromptEditor(current);
        var id = button.dataset.promptEdit || button.dataset.promptDelete || button.dataset.promptMove;
        var prompt = id && current.prompts.find(function(item) { return item.id === id; });
        if (prompt && button.dataset.promptEdit) openPresetPromptEditor(current, prompt);
        if (prompt && button.dataset.promptDelete && confirm('删除条目？')) {
            current.prompts = current.prompts.filter(function(item) { return item !== prompt; });
            current.promptOrder = current.promptOrder.filter(function(item) { return item.identifier !== (prompt.identifier || prompt.id); });
            persistState(true); renderSillyTavernPresetSettings();
        }
        if (prompt && button.dataset.promptMove) {
            moveLibraryPrompt(current, prompt, Number(button.dataset.direction));
            persistState(true); renderSillyTavernPresetSettings();
        }
        refreshPresetLibraryDialog();
    });
    refreshPresetLibraryDialog();
}
