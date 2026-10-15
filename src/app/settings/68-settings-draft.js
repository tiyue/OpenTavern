var settingsFormDraft = null;
var settingsFormBaseline = null;
var settingsFormStateBaseline = null;
var settingsFormOriginal = null;
var settingsPersonaBaseline = null;
var settingsImageTokenBaseline = '';
var SETTINGS_FORM_KEYS = ('apiEndpoint apiKey saveApiKey model apiModelCatalog contextLength maxTokens temperature frequencyPenalty presencePenalty topP systemPrompt postHistoryInstructions twoStageEnabled twoStageTemperature twoStageTopP twoStageIncludeRecentContext twoStageSystemPrompt twoStagePostHistoryInstructions requestCotEnabled showCotEnabled authorNote promptPostProcessing reasoningEffort thinking modelContextCapacity summaryEnabled summaryThreshold summaryMaxWords summaryPrompt summaryTemperature summaryPromptMode summaryReasoningEffort summaryThinking worldInfoBudgetEnabled worldInfoBudget summarizeUseMainAPI summarizeApiEndpoint summarizeApiKey summarizeModel uiTheme lowPowerMode showReplyAvatar showMsgTokenUsage submitWithCmdEnter streamEnabled streamTextAnimEnabled streamTextAnimEffect streamTextAnimUnit streamTextAnimDuration streamTextAnimDistance streamTextAnimScale streamTextAnimStagger streamIdleTimeoutSec imageGenerationEnabled imageGenerationEndpoint imageGenerationSize imageGenerationStylePrompt imageGenerationNegativePrompt imageGenerationPromptExtend imageGenerationIncludeCharacter imageGenerationIncludeContext imageGenerationPromptTemplate cloudSyncEnabled cloudSyncAutoUpload cloudSyncEndpoint cloudSyncToken cloudSyncPassphrase readingWidth readingFontSize restoreLastChat chatBackground').split(' ');
var SETTINGS_CLOUD_FORM_KEYS = ['cloudSyncEnabled', 'cloudSyncAutoUpload', 'cloudSyncEndpoint', 'cloudSyncToken', 'cloudSyncPassphrase'];

function getSettingsFormTarget() { return settingsFormDraft || state.settings; }
function settingsValueEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function copySettingsValue(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function beginSettingsDraft() {
    if (settingsFormDraft) return false;
    settingsFormOriginal = state.settings;
    settingsFormStateBaseline = copySettingsValue(state.settings);
    settingsFormDraft = copySettingsValue(state.settings);
    settingsImageTokenBaseline = getImageGenerationAccessToken();
    return true;
}

function captureSettingsFormBaseline() {
    readSettingsFormIntoState(settingsFormDraft);
    validatePromptControlsSettings(settingsFormDraft);
    settingsFormBaseline = copySettingsValue(settingsFormDraft);
    captureSettingsPersonaBaseline();
    setSettingsDraftError('');
}

function captureSettingsPersonaBaseline() {
    if (!settingsFormDraft) return;
    var id = dom.userPersonaSelect && dom.userPersonaSelect.value || state.settings.activeUserPersonaId;
    var persona = (state.settings.userPersonas || []).find(function(item) { return item.id === id; });
    settingsPersonaBaseline = persona ? copySettingsValue(persona) : null;
}

function readSettingsPersonaCandidate() {
    if (!settingsPersonaBaseline) return null;
    var before = settingsPersonaBaseline;
    var current = (state.settings.userPersonas || []).find(function(item) { return item.id === before.id; });
    var values = { name: readTrimmedControlValue(dom.userPersonaName), userName: readTrimmedControlValueOr(dom.userName, 'User'), description: readTrimmedControlValue(dom.userDescription) };
    var changed = Object.keys(values).filter(function(key) { return values[key] !== before[key]; });
    if (!changed.length) return null;
    if (!current || changed.some(function(key) { return current[key] !== before[key]; })) throw new Error('此用户设定已变化，请放弃后重新打开设置。');
    if (!values.name) throw new Error('用户设定名称不能为空。');
    return { current: current, values: values, keys: changed };
}

function validateSettingsFormControls() {
    var controls = dom.settingsModal.querySelectorAll('input[type="number"], input[type="range"], select');
    for (var control of controls) {
        if (control.disabled) continue;
        var invalid = false;
        if (control.tagName === 'SELECT') invalid = control.selectedIndex < 0;
        else {
            var value = Number(control.value);
            invalid = !control.value.trim() || !Number.isFinite(value) || (control.min !== '' && value < Number(control.min)) || (control.max !== '' && value > Number(control.max)) || (control.step === '1' && !Number.isInteger(value));
        }
        if (!invalid) continue;
        var panel = control.closest('[role="tabpanel"]');
        if (panel) activateSettingsTab(panel.getAttribute('aria-labelledby'), false);
        control.focus(); throw new Error('请检查选中控件的数值范围或选项。');
    }
}

function setSettingsDraftError(message) {
    var error = document.getElementById('settingsDraftError');
    if (error) { error.textContent = message; error.hidden = !message; }
}

function discardSettingsDraft() {
    settingsFormDraft = null; settingsFormBaseline = null; settingsFormStateBaseline = null; settingsFormOriginal = null; settingsPersonaBaseline = null;
    dom.settingsModal.classList.add('hidden'); setSettingsDraftError('');
    applyUiTheme(state.settings.uiTheme, { cache: false }); applyReadingAppearance(state.settings);
}

function commitSettingsDraft() {
    if (!settingsFormDraft) return false;
    validateSettingsFormControls();
    readSettingsFormIntoState(settingsFormDraft);
    validatePromptControlsSettings(settingsFormDraft);
    var changes = SETTINGS_FORM_KEYS.filter(function(key) { return !settingsValueEqual(settingsFormDraft[key], settingsFormBaseline[key]); });
    if (state.settings !== settingsFormOriginal) throw new Error('设置已被恢复替换，请放弃后重新打开设置。');
    if (changes.some(function(key) { return !settingsValueEqual(state.settings[key], settingsFormStateBaseline[key]); })) throw new Error('同一设置已被其他操作修改，请放弃后重新打开设置。');
    var persona = readSettingsPersonaCandidate();
    var token = dom.imageGenerationToken ? dom.imageGenerationToken.value.trim() : settingsImageTokenBaseline;
    if (token !== settingsImageTokenBaseline && getImageGenerationAccessToken() !== settingsImageTokenBaseline) throw new Error('图片访问令牌已变化，请放弃后重新打开设置。');
    var oldAvatar = state.settings.showReplyAvatar, oldUsage = state.settings.showMsgTokenUsage;
    changes.forEach(function(key) { state.settings[key] = copySettingsValue(settingsFormDraft[key]); });
    if (persona) {
        persona.keys.forEach(function(key) { persona.current[key] = persona.values[key]; });
        if (state.settings.activeUserPersonaId === persona.current.id) syncLegacyUserPersonaFields(state.settings, persona.current.id);
    }
    if (token !== settingsImageTokenBaseline) saveImageGenerationAccessToken(token);
    state._settingsMessageDisplayChanged = oldAvatar !== state.settings.showReplyAvatar || oldUsage !== state.settings.showMsgTokenUsage;
    settingsFormDraft = null; settingsFormBaseline = null; settingsFormStateBaseline = null; settingsFormOriginal = null; settingsPersonaBaseline = null;
    return true;
}

function commitSettingsCloudConnection() {
    readCloudSyncSettingsFromForm(state.settings);
    if (!settingsFormDraft) return;
    SETTINGS_CLOUD_FORM_KEYS.forEach(function(key) {
        settingsFormDraft[key] = copySettingsValue(state.settings[key]);
        settingsFormBaseline[key] = copySettingsValue(state.settings[key]);
        settingsFormStateBaseline[key] = copySettingsValue(state.settings[key]);
    });
}
