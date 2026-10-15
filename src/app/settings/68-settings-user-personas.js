/**
 * 新手导读（文件：68-settings-user-personas.js）
 *
 * 负责什么：渲染并操作设置页中的多套用户设定，包括新建、复制、删除和会话级选择。
 * 在程序中的位置：状态层已经完成 persona 规范化之后，由设置弹窗回填和事件初始化调用。
 * 从哪里开始看：从 `hydrateUserPersonaSettings()` 与 `bindUserPersonaSettingsEvents()` 开始阅读。
 * 修改时注意：切换设定前必须先提交当前表单，否则用户尚未关闭弹窗的编辑会丢失。
 */
function getUserPersonaOptionLabel(persona) {
    return persona.name + '（' + (persona.userName || 'User') + '）';
}

function renderUserPersonaSelect() {
    if (!dom.userPersonaSelect) return;
    ensureUserPersonaSettings(state.settings);
    dom.userPersonaSelect.innerHTML = '';
    state.settings.userPersonas.forEach(function(persona) {
        var option = document.createElement('option');
        option.value = persona.id;
        option.textContent = getUserPersonaOptionLabel(persona);
        dom.userPersonaSelect.appendChild(option);
    });
    dom.userPersonaSelect.value = state.settings.activeUserPersonaId;
    if (dom.userPersonaDeleteBtn) dom.userPersonaDeleteBtn.disabled = state.settings.userPersonas.length <= 1;
}

function hydrateActiveUserPersonaFields() {
    var persona = getUserPersonaById(state.settings.activeUserPersonaId, state.settings) || state.settings.userPersonas[0];
    hydrateValueControl(dom.userPersonaName, persona.name);
    hydrateValueControl(dom.userName, persona.userName || 'User');
    hydrateValueControl(dom.userDescription, persona.description || '');
    if (typeof captureSettingsPersonaBaseline === 'function') captureSettingsPersonaBaseline();
}

function hydrateUserPersonaSettings() {
    syncActiveConversationUserPersona();
    renderUserPersonaSelect();
    hydrateActiveUserPersonaFields();
}

function commitUserPersonaForm() {
    if (typeof settingsFormDraft !== 'undefined' && settingsFormDraft) {
        try {
            if (state.settings !== settingsFormOriginal) throw new Error('设置已被恢复替换，请放弃后重新打开设置。');
            var current = settingsPersonaBaseline && (state.settings.userPersonas || []).find(function(item) { return item.id === settingsPersonaBaseline.id; });
            if (!current) throw new Error('此用户设定已变化，请放弃后重新打开设置。');
            var candidate = readSettingsPersonaCandidate();
            if (candidate) candidate.keys.forEach(function(key) { candidate.current[key] = candidate.values[key]; });
            if (state.settings.activeUserPersonaId === current.id) syncLegacyUserPersonaFields(state.settings, current.id);
            return current;
        } catch (error) { setSettingsDraftError(error.message); return null; }
    }
    return updateActiveUserPersona({
        name: readTrimmedControlValue(dom.userPersonaName),
        userName: readTrimmedControlValueOr(dom.userName, 'User'),
        description: readTrimmedControlValue(dom.userDescription)
    });
}

function switchUserPersonaFromSettings(id) {
    if (!commitUserPersonaForm()) { dom.userPersonaSelect.value = settingsPersonaBaseline ? settingsPersonaBaseline.id : state.settings.activeUserPersonaId; return; }
    activateUserPersona(id, null, true);
    renderUserPersonaSelect();
    hydrateActiveUserPersonaFields();
    persistState();
}

function buildNewUserPersona(copySource) {
    var index = state.settings.userPersonas.length + 1;
    var name = copySource
        ? copySource.name + ' ' + t('settings_user_persona_copy_suffix')
        : t('settings_user_persona_new_name').replace('{n}', index);
    return {
        id: createUserPersonaId(),
        name: name,
        userName: copySource ? copySource.userName : 'User',
        description: copySource ? copySource.description : ''
    };
}

function addUserPersona(copyCurrent) {
    var current = commitUserPersonaForm();
    if (!current) return;
    var persona = buildNewUserPersona(copyCurrent ? current : null);
    state.settings.userPersonas.push(persona);
    activateUserPersona(persona.id, null, true);
    renderUserPersonaSelect();
    hydrateActiveUserPersonaFields();
    if (dom.userPersonaName) dom.userPersonaName.focus();
    persistState();
}

async function deleteActiveUserPersona() {
    if (typeof settingsFormDraft !== 'undefined' && settingsFormDraft && state.settings !== settingsFormOriginal) { setSettingsDraftError('设置已被恢复替换，请放弃后重新打开设置。'); return; }
    ensureUserPersonaSettings(state.settings);
    if (state.settings.userPersonas.length <= 1) return;
    var originalSettings = state.settings;
    var deletedId = typeof settingsPersonaBaseline !== 'undefined' && settingsPersonaBaseline ? settingsPersonaBaseline.id : state.settings.activeUserPersonaId;
    var target = state.settings.userPersonas.find(function(persona) { return persona.id === deletedId; });
    if (!target) return;
    var targetBefore = JSON.stringify(target);
    var confirmed = await showGlassConfirm(t('settings_user_persona_delete_confirm'), {
        title: t('settings_user_persona_delete'),
        danger: true,
        okText: t('settings_user_persona_delete')
    });
    if (!confirmed) return;
    var currentTarget = (state.settings.userPersonas || []).find(function(persona) { return persona.id === deletedId; });
    if (state.settings !== originalSettings || !currentTarget || JSON.stringify(currentTarget) !== targetBefore || state.settings.userPersonas.length <= 1) { setSettingsDraftError('此用户设定已变化，删除未执行，请重新打开设置。'); return; }

    state.settings.userPersonas = state.settings.userPersonas.filter(function(persona) {
        return persona.id !== deletedId;
    });
    var replacement = state.settings.userPersonas[0];
    Object.keys(state.conversations || {}).forEach(function(id) {
        if (state.conversations[id] && state.conversations[id].userPersonaId === deletedId) {
            state.conversations[id].userPersonaId = replacement.id;
        }
    });
    if (state.settings.activeUserPersonaId === deletedId) state.settings.activeUserPersonaId = replacement.id;
    syncLegacyUserPersonaFields(state.settings, state.settings.activeUserPersonaId);
    renderUserPersonaSelect();
    hydrateActiveUserPersonaFields();
    persistState();
}

function bindUserPersonaSettingsEvents() {
    if (dom.userPersonaSelect) {
        dom.userPersonaSelect.addEventListener('change', function() {
            switchUserPersonaFromSettings(this.value);
        });
    }
    if (dom.userPersonaNewBtn) dom.userPersonaNewBtn.addEventListener('click', function() { addUserPersona(false); });
    if (dom.userPersonaCopyBtn) dom.userPersonaCopyBtn.addEventListener('click', function() { addUserPersona(true); });
    if (dom.userPersonaDeleteBtn) dom.userPersonaDeleteBtn.addEventListener('click', deleteActiveUserPersona);
}
