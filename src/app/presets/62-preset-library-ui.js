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
    container.querySelector('select').onchange = function(event) { Promise.resolve(selectLibraryPreset(event.target.value)).catch(function(error) { alert(error.message); renderSillyTavernPresetSettings(); }); };
    container.querySelector('button').onclick = openPresetLibrary;
    var squash = document.createElement('label'); squash.className = 'feature-check';
    var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.settings.sillyTavernPreset.squashSystemMessages === true;
    checkbox.addEventListener('change', async function() {
        checkbox.disabled = true;
        try { await savePresetLibraryChange(function(settings) { settings.sillyTavernPreset.squashSystemMessages = checkbox.checked; }); }
        catch (error) { alert(error.message); checkbox.checked = !checkbox.checked; } finally { checkbox.disabled = false; }
    });
    squash.append(checkbox, document.createTextNode('合并连续 System 消息')); container.appendChild(squash);
    renderPresetDraftRecovery();
}

function openPresetPromptEditor(preset, prompt) {
    var draft = createPresetLibraryDraft();
    preset = draft.settings.presetLibrary.find(function(item) { return item.id === preset.id; });
    prompt = prompt && preset.prompts.find(function(item) { return item.id === prompt.id; });
    var value = prompt || { id: makeId(), name: '', content: '', enabled: true, role: 'system', position: 'before_history', depth: 4 };
    var body = featureField('名称', 'presetPromptName', value.name) + featureField('正文', 'presetPromptContent', value.content, 'textarea') +
        featureSelect('消息角色', 'presetPromptRole', value.role, [['system', 'system'], ['user', 'user'], ['assistant', 'assistant']]) +
        featureSelect('位置', 'presetPromptPosition', getSillyTavernPresetPlacement(value, 'before_history'), [['before_history', '历史之前'], ['after_history', '历史之后'], ['in_chat', '指定深度']]) +
        featureField('深度（从消息数组末尾计数）', 'presetPromptDepth', parseSillyTavernDepth(value), 'number', 'min="0" max="1000" step="1"') +
        '<label class="feature-check"><input id="presetPromptEnabled" type="checkbox"' + (value.enabled !== false ? ' checked' : '') + '>启用</label>';
    openFeatureDialog('presetPromptEditor', '预设条目', body, async function(dialog) {
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
        await commitPresetLibraryDraft(draft);
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
    var dialog = openFeatureDialog('presetLibraryDialog', '预设库', '<p class="feature-hint">每次修改须保存确认；失败草稿可重试、导出或放弃。</p>' +
        featureField('当前预设名称', 'libraryPresetName', preset.name) +
        '<div class="feature-toolbar"><button type="button" data-library-action="rename">改名</button><button type="button" data-library-action="new">新建预设</button><button type="button" data-library-action="copy">复制预设</button>' +
        '<button type="button" data-library-action="delete">删除预设</button><button type="button" data-library-action="compare">比较预设</button><button type="button" data-library-action="export">导出整库</button><button type="button" data-library-action="regex">预设正则</button><button type="button" data-library-action="prompt">新建条目</button></div><div data-preset-prompts></div>', null);
    dialog.addEventListener('click', async function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        var current = ensureSillyTavernPresetSettings();
        var action = button.dataset.libraryAction;
        try {
        if (action === 'new') await addLibraryPreset(Object.assign(defaultSillyTavernPreset(), { name: '新预设' }));
        if (action === 'copy') await addLibraryPreset(Object.assign(JSON.parse(JSON.stringify(current)), { name: (current.name || '预设') + ' 副本' }));
        if (action === 'rename') {
            var name = dialog.querySelector('#libraryPresetName').value.trim();
            if (!name) { dialog.querySelector('.feature-error').textContent = '名称不能为空'; return; }
            await savePresetLibraryChange(function(settings) { settings.sillyTavernPreset.name = name; });
        }
        if (action === 'delete' && confirm('删除当前预设？')) await removeLibraryPreset(current.id);
        if (action === 'compare' && typeof openPresetDiffDialog === 'function') openPresetDiffDialog({ left: current });
        if (action === 'export') downloadJsonFile({ type: 'opentavern-preset-library', activePresetId: state.settings.activePresetId, presets: ensurePresetLibrary() }, 'opentavern-presets.json');
        if (action === 'regex') openRegexManager('preset');
        if (action === 'prompt') openPresetPromptEditor(current);
        var id = button.dataset.promptEdit || button.dataset.promptDelete || button.dataset.promptMove;
        var prompt = id && current.prompts.find(function(item) { return item.id === id; });
        if (prompt && button.dataset.promptEdit) openPresetPromptEditor(current, prompt);
        if (prompt && button.dataset.promptDelete && confirm('删除条目？')) {
            await savePresetLibraryChange(function(settings) {
                var value = settings.sillyTavernPreset;
                value.prompts = value.prompts.filter(function(item) { return item.id !== prompt.id; });
                value.promptOrder = value.promptOrder.filter(function(item) { return item.identifier !== (prompt.identifier || prompt.id); });
            });
        }
        if (prompt && button.dataset.promptMove) {
            await savePresetLibraryChange(function(settings) {
                var value = settings.sillyTavernPreset;
                moveLibraryPrompt(value, value.prompts.find(function(item) { return item.id === prompt.id; }), Number(button.dataset.direction));
            });
        }
        refreshPresetLibraryDialog();
        } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
    });
    refreshPresetLibraryDialog();
}
