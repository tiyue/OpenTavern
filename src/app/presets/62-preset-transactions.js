// Editing candidates remain separate from the preset used for generation until storage ACK.
var failedPresetLibraryDraft = null;

function createPresetLibraryDraft() {
    ensurePresetLibrary();
    var keys = ['presetLibrary', 'activePresetId', 'sillyTavernPreset'], settings = {};
    keys.forEach(function(key) { settings[key] = JSON.parse(JSON.stringify(state.settings[key])); });
    ensurePresetLibrary(settings);
    return { root: state.settings, baseline: JSON.stringify(keys.map(function(key) { return state.settings[key]; })), settings: settings };
}

async function commitPresetLibraryDraft(draft) {
    var keys = ['presetLibrary', 'activePresetId', 'sillyTavernPreset'];
    ensurePresetLibrary(draft.settings);
    draft.settings.presetLibrary.forEach(function(preset) {
        if (typeof preset.name !== 'string' || !preset.name.trim()) throw new Error('预设名称不能为空。');
        preset.prompts.forEach(function(prompt) { validatePresetPrompt(Object.assign({}, prompt, { position: getSillyTavernPresetPlacement(prompt, 'before_history'), depth: parseSillyTavernDepth(prompt) })); });
        preset.regexScripts.forEach(validateRegexScript);
        if (preset.squashSystemMessages !== undefined && typeof preset.squashSystemMessages !== 'boolean') throw new Error('System 压缩开关无效。');
    });
    function check() {
        if (state.settings !== draft.root || JSON.stringify(keys.map(function(key) { return state.settings[key]; })) !== draft.baseline) throw new Error('预设库已变化，请导出草稿或放弃后重试。');
    }
    function merge(snapshot) {
        keys.forEach(function(key) { snapshot.settings[key] = JSON.parse(JSON.stringify(draft.settings[key])); });
        return snapshot;
    }
    try {
        check();
        await persistState(true, { throwOnError: true, beforePersist: check, transformSnapshot: merge,
            onPersistSuccess: function() { check(); merge({ settings: state.settings }); ensurePresetLibrary(); },
            commitPendingSnapshot: function(snapshot) {
                if (JSON.stringify(keys.map(function(key) { return snapshot.settings[key]; })) === draft.baseline) merge(snapshot);
            }
        });
        if (failedPresetLibraryDraft === draft) failedPresetLibraryDraft = null;
        renderSillyTavernPresetSettings(); renderTokenBar(); appStore.notify('settings');
    } catch (error) { failedPresetLibraryDraft = draft; renderPresetDraftRecovery(); throw error; }
}

function savePresetLibraryChange(change) {
    if (failedPresetLibraryDraft) return Promise.reject(new Error('请先重试、导出或放弃未保存的预设草稿。'));
    var draft = createPresetLibraryDraft();
    change(draft.settings);
    ensurePresetLibrary(draft.settings);
    return commitPresetLibraryDraft(draft);
}

function renderPresetDraftRecovery() {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('presetDraftRecovery');
    if (host) host.remove();
    if (!failedPresetLibraryDraft || !dom.stPresetStatus) return;
    host = document.createElement('div'); host.id = 'presetDraftRecovery'; host.className = 'feature-inline';
    var note = document.createElement('span'); note.textContent = '预设尚未保存，生成仍使用原版本。'; host.appendChild(note);
    [['重试保存', async function() { await commitPresetLibraryDraft(failedPresetLibraryDraft); }], ['导出草稿', function() {
        var draft = failedPresetLibraryDraft.settings;
        downloadJsonFile({ type: 'opentavern-preset-library', presets: draft.presetLibrary, activePresetId: draft.activePresetId }, 'opentavern-preset-draft.json');
    }], ['放弃草稿', function() { failedPresetLibraryDraft = null; renderPresetDraftRecovery(); }]].forEach(function(item) {
        var button = document.createElement('button'); button.type = 'button'; button.textContent = item[0];
        button.addEventListener('click', async function() { button.disabled = true; try { await item[1](); renderPresetDraftRecovery(); } catch (error) { alert(error.message); button.disabled = false; } }); host.appendChild(button);
    });
    dom.stPresetStatus.before(host);
}

function squashPresetSystemMessages(messages) {
    var result = [];
    messages.forEach(function(message) {
        var previous = result[result.length - 1];
        function metadata(value) { var copy = Object.assign({}, value); delete copy.content; return JSON.stringify(copy); }
        if (previous && previous.role === 'system' && message.role === 'system' && metadata(previous) === metadata(message)) {
            previous.content = typeof mergePromptContents === 'function' ? mergePromptContents(previous.content, message.content) : String(previous.content) + '\n\n' + String(message.content);
        } else result.push(Object.assign({}, message));
    });
    return result;
}
