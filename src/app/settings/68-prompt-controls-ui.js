function getPromptEditableSettings() {
    return typeof settingsFormDraft !== 'undefined' && settingsFormDraft ? settingsFormDraft : state.settings;
}

function editAuthorNote(conversation) {
    var settingsTarget = getPromptEditableSettings();
    var note = Object.assign(defaultAuthorNote(), conversation ? getEffectiveAuthorNote(conversation) : settingsTarget.authorNote);
    var body = '<label class="feature-check"><input id="authorNoteEnabled" type="checkbox"' + (note.enabled ? ' checked' : '') + '>启用</label>' +
        (conversation ? '<label class="feature-check"><input id="authorNoteDefault" type="checkbox"' + (conversation.authorNoteOverride == null ? ' checked' : '') + '>使用全局默认</label>' : '') +
        featureField('正文', 'authorNoteContent', note.content, 'textarea') + featureSelect('消息角色', 'authorNoteRole', note.role, [['system', 'system'], ['user', 'user'], ['assistant', 'assistant']]) +
        featureSelect('位置', 'authorNotePosition', note.position, [['before_history', '历史之前'], ['after_history', '历史之后'], ['in_chat', '指定深度']]) +
        featureField('深度（末尾为 0）', 'authorNoteDepth', note.depth, 'number', 'min="0" max="1000" step="1"') + featureField('每隔几条非 system 消息插入', 'authorNoteInterval', note.interval, 'number', 'min="1" max="1000" step="1"');
    openFeatureDialog('authorNoteDialog', conversation ? '会话笔记' : "默认 Author's Note", body, function(dialog) {
        var updated = validateAuthorNote({
            enabled: dialog.querySelector('#authorNoteEnabled').checked, content: dialog.querySelector('#authorNoteContent').value,
            role: dialog.querySelector('#authorNoteRole').value, position: dialog.querySelector('#authorNotePosition').value,
            depth: featureNumber(dialog, 'authorNoteDepth', 0, 1000, true), interval: featureNumber(dialog, 'authorNoteInterval', 1, 1000, true)
        });
        if (conversation) {
            if (!isLiveConversation(conversation)) throw new Error('会话已变化');
            if (dialog.querySelector('#authorNoteDefault').checked) delete conversation.authorNoteOverride;
            else conversation.authorNoteOverride = updated;
            conversation.updated = Date.now(); conversation._wiCache = null;
            persistState(true);
        } else {
            if (getPromptEditableSettings() !== settingsTarget) throw new Error('设置草稿已关闭，请重新打开。');
            var settings = settingsTarget;
            settings.authorNote = updated;
            if (settings === state.settings) persistState(true);
        }
        renderTokenBar();
    });
}

function editReasoningSettings(summary) {
    var settings = getPromptEditableSettings();
    var effortKey = summary ? 'summaryReasoningEffort' : 'reasoningEffort';
    var thinkingKey = summary ? 'summaryThinking' : 'thinking';
    var choices = [['', '不发送'], ['none', 'none'], ['minimal', 'minimal'], ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['xhigh', 'xhigh']];
    openFeatureDialog('reasoningSettingsDialog', summary ? '总结请求参数' : '聊天请求参数',
        '<p class="feature-hint">仅在你选择后发送；与请求或显示思考过程分开。不支持字段的接口会显示原始错误。</p>' +
        featureSelect('reasoning_effort', 'reasoningEffortValue', settings[effortKey] || '', choices) +
        featureSelect('thinking', 'thinkingModeValue', settings[thinkingKey] && settings[thinkingKey].type || '', [['', '不发送'], ['enabled', 'enabled'], ['disabled', 'disabled']]) +
        (!summary ? featureField('模型上下文容量（0 为未知）', 'modelCapacityValue', settings.modelContextCapacity || 0, 'number', 'min="0" max="10000000" step="1"') : ''), function(dialog) {
            if (getPromptEditableSettings() !== settings) throw new Error('设置草稿已关闭，请重新打开。');
            var target = settings;
            var mode = dialog.querySelector('#thinkingModeValue').value;
            var capacity = summary ? null : featureNumber(dialog, 'modelCapacityValue', 0, 10000000, true);
            target[effortKey] = dialog.querySelector('#reasoningEffortValue').value;
            target[thinkingKey] = mode ? { type: mode } : null;
            if (!summary) target.modelContextCapacity = capacity;
            if (target === state.settings) persistState(true);
        });
}

function openConversationPromptControls() {
    var conv = getActiveConv();
    if (!conv) return;
    var body = '<div class="feature-toolbar"><button type="button" id="conversationNoteButton">会话笔记</button></div>' +
        featureSelect('世界书激活策略', 'conversationWorldBookMode', conv.worldBookMode || 'default', [['default', '默认关键词匹配'], ['off', '本会话关闭'], ['constant', '本会话强制常驻（保留禁用与预算限制）']]) +
        featureSelect('当前预设（全局即时切换）', 'conversationPresetChoice', state.settings.activePresetId, ensurePresetLibrary().map(function(preset) { return [preset.id, preset.name || '未命名']; }));
    var dialog = openFeatureDialog('conversationPromptDialog', '会话提示词', body, function(current) {
        if (!isLiveConversation(conv)) throw new Error('会话已变化');
        if (state.isGenerating) throw new Error('请等待当前生成完成');
        conv.worldBookMode = current.querySelector('#conversationWorldBookMode').value;
        conv._wiCache = null; conv.updated = Date.now();
        persistState(true); renderTokenBar();
    });
    dialog.querySelector('#conversationNoteButton').onclick = function() { editAuthorNote(conv); };
    dialog.querySelector('#conversationPresetChoice').onchange = function(event) { selectLibraryPreset(event.target.value); };
}

function hydrateDepthPromptEditor(character) {
    var container = document.getElementById('depthPromptEditor');
    if (!container) {
        container = document.createElement('div'); container.id = 'depthPromptEditor'; container.className = 'feature-section';
        dom.charEditCreatorNotes.parentElement.before(container);
    }
    var value = getCharacterDepthPrompt(character) || { content: '', role: 'system', depth: 4 };
    container.innerHTML = featureField('Depth Prompt（角色深度提示词）', 'characterDepthContent', value.content, 'textarea') +
        '<div class="feature-grid">' + featureSelect('消息角色', 'characterDepthRole', value.role, [['system', 'system'], ['user', 'user'], ['assistant', 'assistant']]) +
        featureField('深度（末尾为 0）', 'characterDepthNumber', value.depth, 'number', 'min="0" max="1000" step="1"') + '</div>';
}

function readDepthPromptEditor(character) {
    var container = document.getElementById('depthPromptEditor');
    if (!container) return;
    var depth = Number(container.querySelector('#characterDepthNumber').value);
    if (!Number.isInteger(depth) || depth < 0 || depth > 1000) throw new Error('Depth Prompt 深度须为 0–1000 的整数');
    var prompt = container.querySelector('#characterDepthContent').value;
    character.extensions = Object.assign({}, character.extensions);
    if (prompt || character.extensions.depth_prompt || character.depth_prompt) {
        var value = Object.assign({}, character.extensions.depth_prompt || character.depth_prompt || {}, { prompt: prompt, depth: depth, role: container.querySelector('#characterDepthRole').value });
        character.extensions.depth_prompt = value;
        if (character.depth_prompt) character.depth_prompt = Object.assign({}, value);
    }
}

function hydratePromptControlsSettings() {
    var settings = getPromptEditableSettings();
    var temperature = document.getElementById('summaryTemperature');
    if (temperature) temperature.value = settings.summaryTemperature == null ? 0.3 : settings.summaryTemperature;
    var mode = document.getElementById('summaryPromptMode');
    if (mode) mode.value = settings.summaryPromptMode || 'standard';
    var processing = document.getElementById('promptPostProcessing');
    if (processing) processing.value = settings.promptPostProcessing || 'auto';
}

function validatePromptControlsSettings(target) {
    var input = document.getElementById('summaryTemperature');
    if (!input) return;
    if (!input.value.trim() || !Number.isFinite(Number(input.value)) || Number(input.value) < 0 || Number(input.value) > 2) {
        activateSettingsTab('settingsTabSummary', false); input.focus(); throw new Error('总结 Temperature 须为 0–2 的数值');
    }
    var settings = target || getPromptEditableSettings();
    settings.summaryTemperature = Number(input.value);
    settings.summaryPromptMode = document.getElementById('summaryPromptMode').value;
    settings.promptPostProcessing = document.getElementById('promptPostProcessing').value;
}

function bindPromptControlsEvents() {
    function appendButton(panelId, id, text, action) {
        var panel = document.getElementById(panelId);
        var button = document.createElement('button'); button.id = id; button.type = 'button'; button.className = 'feature-entry'; button.textContent = text; button.onclick = action;
        panel.appendChild(button);
    }
    appendButton('settingsPanelModel', 'mainReasoningSettings', '聊天请求参数', function() { editReasoningSettings(false); });
    appendButton('settingsPanelPrompts', 'defaultAuthorNoteSettings', "默认 Author's Note", function() { editAuthorNote(null); });
    appendButton('settingsPanelSummary', 'summaryReasoningSettings', '总结请求参数', function() { editReasoningSettings(true); });
    appendButton('settingsPanelExtensions', 'globalRegexSettings', '正则管理', function() { openRegexManager('global'); });
    var summary = document.createElement('div'); summary.className = 'feature-grid';
    summary.innerHTML = featureField('总结 Temperature', 'summaryTemperature', 0.3, 'number', 'min="0" max="2" step="0.1"') +
        featureSelect('内置总结模式（自定义正文优先）', 'summaryPromptMode', 'standard', [['standard', '标准'], ['relaxed', '宽松']]);
    document.getElementById('settingsPanelSummary').appendChild(summary);
    var processing = document.createElement('div');
    processing.innerHTML = featureSelect('提示词后处理', 'promptPostProcessing', 'auto', [['auto', '自动端点兼容'], ['raw', '原样'], ['merge', '合并相邻同角色'], ['system_to_user', '后续 system 转 user 并合并'], ['user_last', '后续 system 转 user，末尾为 user']]);
    document.getElementById('settingsPanelPrompts').appendChild(processing);
    var conversation = document.createElement('button'); conversation.type = 'button'; conversation.id = 'conversationPromptControls'; conversation.className = 'feature-entry feature-entry-compact'; conversation.textContent = '会话';
    conversation.onclick = openConversationPromptControls;
    dom.viewPromptBtn.parentElement.appendChild(conversation);
}
