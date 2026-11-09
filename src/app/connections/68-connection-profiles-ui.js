// Connection profile settings entry, management dialog and explicit migration/failure recovery.
var connectionProfileUiBusy = false;
var connectionProfileManagerRefresh = null;

function connectionProfilePurposeLabel(purpose) {
    return t(purpose === 'main' ? 'conn_profile_purpose_main' : purpose === 'summary' ? 'conn_profile_purpose_summary' : 'conn_profile_purpose_embedding');
}

function renderConnectionProfileSelect(purpose) {
    var select = document.getElementById(purpose + 'ConnectionProfileSelect');
    if (!select) return;
    var profiles = getConnectionProfilesByPurpose(purpose);
    var active = state.settings.activeConnectionProfileIds && state.settings.activeConnectionProfileIds[purpose] || '';
    select.replaceChildren();
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('conn_profile_select_required');
    select.appendChild(empty);
    profiles.forEach(function(profile) {
        var option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name + (profile.parameters && profile.parameters.useMain ? ' · ' + t('conn_profile_uses_main') : '');
        select.appendChild(option);
    });
    select.value = profiles.some(function(profile) { return profile.id === active; }) ? active : '';
    select.onchange = function() {
        var nextId = select.value;
        if (!nextId) return;
        select.disabled = true;
        applyConnectionProfileSelection(purpose, nextId).catch(function(error) {
            setConnectionProfileStatus(error.message);
        }).finally(function() {
            select.disabled = false;
            hydrateConnectionProfileControls();
        });
    };
}

function setConnectionProfileStatus(message) {
    var status = document.getElementById('connectionProfileStatus');
    if (status) status.textContent = message || '';
}

function hydrateConnectionProfileControls() {
    if (!state.settings || typeof ensureConnectionProfiles !== 'function') return;
    ensureConnectionProfiles(state.settings);
    CONNECTION_PROFILE_PURPOSES.forEach(function(purpose) {
        renderConnectionProfileSelect(purpose);
        var warning = document.getElementById(purpose + 'ConnectionProfileWarning');
        if (!warning) return;
        var activeId = state.settings.activeConnectionProfileIds[purpose] || '';
        var profile = getActiveConnectionProfile(purpose);
        var message = '';
        if (activeId && !profile) message = t('conn_profile_missing');
        else if (profile && purpose !== 'embedding' && !hasConnectionProfileCredential(profile) && !(purpose === 'summary' && profile.parameters && profile.parameters.useMain)) message = t('conn_profile_credential_missing');
        warning.textContent = message;
        warning.hidden = !message;
    });
    var embedding = getActiveConnectionProfile('embedding');
    var embeddingHint = document.getElementById('embeddingConnectionProfileHint');
    if (embeddingHint) {
        embeddingHint.textContent = embedding && embedding.description
            ? embedding.description
            : t('conn_profile_embedding_stage_hint');
    }
    renderConnectionProfileDraftRecovery();
}

function renderConnectionProfileDraftRecovery() {
    var host = document.getElementById('connectionProfileDraftRecovery');
    if (host) host.remove();
    if (!failedConnectionProfileDraft) return;
    var anchor = document.getElementById('connectionProfileStatus');
    if (!anchor || !anchor.parentElement) return;
    host = document.createElement('div');
    host.id = 'connectionProfileDraftRecovery';
    host.className = 'feature-inline connection-profile-recovery';
    var note = document.createElement('span');
    note.textContent = t('conn_profile_draft_pending');
    host.appendChild(note);
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = t('conn_profile_retry');
    retry.onclick = async function() {
        retry.disabled = true;
        try {
            var draft = failedConnectionProfileDraft;
            failedConnectionProfileDraft = null;
            await commitConnectionProfileSettingsKeys(draft.candidate, draft.keys);
            hydrateConnectionProfileControls();
        } catch (error) {
            setConnectionProfileStatus(error.message);
        } finally {
            retry.disabled = false;
        }
    };
    var discard = document.createElement('button');
    discard.type = 'button';
    discard.textContent = t('conn_profile_discard');
    discard.onclick = function() { failedConnectionProfileDraft = null; hydrateConnectionProfileControls(); };
    host.append(retry, discard);
    anchor.parentElement.insertBefore(host, anchor.nextSibling);
}

function openConnectionProfileManager(startPurpose) {
    var purpose = normalizeConnectionProfilePurpose(startPurpose) || 'main';
    var dialog = openFeatureDialog('connectionProfileManager', t('conn_profile_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('conn_profile_manager_hint')) + '</p>' +
        '<div class="feature-row"><span><strong>' + escapeHtml(t('conn_profile_purpose_filter')) + '</strong></span>' +
        '<select id="connectionProfilePurposeFilter">' + CONNECTION_PROFILE_PURPOSES.map(function(item) {
            return '<option value="' + item + '"' + (item === purpose ? ' selected' : '') + '>' + escapeHtml(connectionProfilePurposeLabel(item)) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="feature-toolbar"><button type="button" data-profile-new>' + escapeHtml(t('conn_profile_new')) + '</button>' +
        '<button type="button" data-profile-import>' + escapeHtml(t('conn_profile_import')) + '</button>' +
        '<button type="button" data-profile-export>' + escapeHtml(t('conn_profile_export')) + '</button></div>' +
        '<input id="connectionProfileImportFile" type="file" accept=".json,application/json" hidden>' +
        '<p class="feature-hint" id="connectionProfileManagerStatus" role="status" aria-live="polite"></p>' +
        '<div id="connectionProfileManagerList"></div>', null);
    function render() {
        var purposeFilter = dialog.querySelector('#connectionProfilePurposeFilter').value;
        var profiles = getConnectionProfilesByPurpose(purposeFilter);
        var activeId = state.settings.activeConnectionProfileIds && state.settings.activeConnectionProfileIds[purposeFilter] || '';
        dialog.querySelector('#connectionProfileManagerList').innerHTML = profiles.map(function(profile) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(profile.name) + (profile.id === activeId ? ' · ' + escapeHtml(t('conn_profile_current')) : '') + '</strong>' +
                '<small>' + escapeHtml(profile.protocol + ' · ' + (profile.parameters && profile.parameters.useMain ? t('conn_profile_uses_main') : profile.endpoint || t('conn_profile_no_endpoint'))) + '</small>' +
                '<small>' + escapeHtml(profile.model || t('conn_profile_no_model')) + (hasConnectionProfileCredential(profile) ? ' · ' + escapeHtml(t('conn_profile_credential_saved')) : '') + '</small></span>' +
                '<button type="button" data-profile-edit="' + escapeHtml(profile.id) + '">' + escapeHtml(t('conn_profile_edit')) + '</button>' +
                '<button type="button" data-profile-copy="' + escapeHtml(profile.id) + '">' + escapeHtml(t('conn_profile_copy')) + '</button>' +
                (profile.id === activeId ? '' : '<button type="button" data-profile-use="' + escapeHtml(profile.id) + '">' + escapeHtml(t('conn_profile_use')) + '</button>') +
                '<button type="button" data-profile-delete="' + escapeHtml(profile.id) + '">' + escapeHtml(t('conn_profile_delete')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('conn_profile_empty')) + '</p>';
    }
    function status(message) {
        var node = dialog.querySelector('#connectionProfileManagerStatus');
        if (node) node.textContent = message || '';
    }
    connectionProfileManagerRefresh = render;
    dialog.addEventListener('close', function() { connectionProfileManagerRefresh = null; });
    dialog.querySelector('#connectionProfilePurposeFilter').onchange = render;
    dialog.addEventListener('click', async function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        var purposeFilter = dialog.querySelector('#connectionProfilePurposeFilter').value;
        var id = button.dataset.profileEdit || button.dataset.profileCopy || button.dataset.profileUse || button.dataset.profileDelete;
        try {
            if (button.hasAttribute('data-profile-new')) openConnectionProfileEditor(null, purposeFilter);
            if (button.hasAttribute('data-profile-import')) dialog.querySelector('#connectionProfileImportFile').click();
            if (button.hasAttribute('data-profile-export')) downloadJsonFile(exportConnectionProfilesData(), 'opentavern-connection-profiles.json');
            if (button.dataset.profileEdit) openConnectionProfileEditor(getConnectionProfileById(id));
            if (button.dataset.profileCopy) {
                var copy = cloneConnectionProfileForCopy(getConnectionProfileById(id));
                await saveConnectionProfileChange(function(candidate, profiles) { profiles.push(copy); });
                render(); hydrateConnectionProfileControls();
            }
            if (button.dataset.profileUse) {
                await applyConnectionProfileSelection(purposeFilter, id);
                render(); hydrateConnectionProfileControls();
            }
            if (button.dataset.profileDelete) await requestDeleteConnectionProfile(id);
            render();
        } catch (error) {
            status(error.message);
        }
    });
    dialog.querySelector('#connectionProfileImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            var raw = JSON.parse(await file.text());
            var profiles = importConnectionProfilesData(raw);
            await saveConnectionProfileChange(function(candidate, target) { profiles.forEach(function(profile) { target.push(profile); }); });
            status(t('conn_profile_imported'));
            render(); hydrateConnectionProfileControls();
        } catch (error) {
            status(error.message);
        }
    };
    render();
}

function requestDeleteConnectionProfile(id) {
    var profile = getConnectionProfileById(id);
    if (!profile) throw new Error(t('conn_profile_missing'));
    var purpose = profile.purpose;
    var activeId = state.settings.activeConnectionProfileIds[purpose] || '';
    if (activeId !== id) {
        return confirmFeatureAction(t('conn_profile_delete_confirm'), t('conn_profile_delete')).then(function(confirmed) {
            if (confirmed) return deleteConnectionProfile(id);
        });
    }
    var alternatives = getConnectionProfilesByPurpose(purpose).filter(function(item) { return item.id !== id; });
    if (!alternatives.length) throw new Error(t('conn_profile_last_purpose'));
    return new Promise(function(resolve, reject) {
        openFeatureDialog('connectionProfileDeleteDialog', t('conn_profile_delete'),
            '<p class="feature-hint">' + escapeHtml(t('conn_profile_delete_active_hint')) + '</p>' +
            featureSelect(t('conn_profile_replacement'), 'connectionProfileReplacement', alternatives[0].id, alternatives.map(function(item) { return [item.id, item.name]; })), async function(dialog) {
                var replacements = {};
                replacements[purpose] = dialog.querySelector('#connectionProfileReplacement').value;
                try {
                    await deleteConnectionProfile(id, replacements);
                    resolve(true);
                } catch (error) {
                    reject(error);
                    throw error;
                }
            }, { onClose: function() { resolve(false); } });
    });
}

function connectionProfileParameterField(profile, key, labelKey, min, max, step) {
    return featureField(t(labelKey), 'connectionProfileParam_' + key, profile.parameters && profile.parameters[key] != null ? profile.parameters[key] : '', 'number',
        'min="' + min + '" max="' + max + '" step="' + (step || 1) + '"');
}

function openConnectionProfileEditor(profile, purpose) {
    var editing = !!profile;
    var draft = profile ? JSON.parse(JSON.stringify(profile)) : {
        id: '', name: '', purpose: normalizeConnectionProfilePurpose(purpose) || 'main',
        protocol: 'openai', endpoint: '', model: '', description: '',
        parameters: normalizeConnectionProfileParameters({}, normalizeConnectionProfilePurpose(purpose) || 'main')
    };
    var originalCredential = editing ? getConnectionProfileCredential(profile) : '';
    var revision = bumpConnectionProfileDraftRevision();
    var presetChoices = [['', t('conn_profile_preset_none')]].concat((ensurePresetLibrary().map(function(item) { return [item.id, item.name || item.id]; })));
    var body = featureField(t('conn_profile_name'), 'connectionProfileName', draft.name) +
        (editing ? '' : featureSelect(t('conn_profile_purpose'), 'connectionProfilePurpose', draft.purpose, CONNECTION_PROFILE_PURPOSES.map(function(item) { return [item, connectionProfilePurposeLabel(item)]; }))) +
        featureSelect(t('conn_profile_protocol'), 'connectionProfileProtocol', draft.protocol, [['openai', 'OpenAI Compatible'], ['anthropic', 'Anthropic Messages']]) +
        featureField(t('conn_profile_endpoint'), 'connectionProfileEndpoint', draft.endpoint) +
        featureField(t('conn_profile_model'), 'connectionProfileModel', draft.model, 'text', 'list="connectionProfileModelList"') +
        '<datalist id="connectionProfileModelList"></datalist>' +
        '<div class="feature-toolbar"><button type="button" id="connectionProfileDiscoverModels">' + escapeHtml(t('conn_profile_discover_models')) + '</button>' +
        '<span class="feature-hint" id="connectionProfileDiscoverStatus" role="status" aria-live="polite"></span></div>' +
        featureField(t('conn_profile_api_key'), 'connectionProfileApiKey', '', 'password') +
        '<label class="feature-check"><input id="connectionProfileClearKey" type="checkbox">' + escapeHtml(t('conn_profile_clear_key')) + '</label>' +
        '<p class="feature-hint">' + escapeHtml(originalCredential ? t('conn_profile_key_saved_hint') : t('conn_profile_key_empty_hint')) + '</p>' +
        '<div id="connectionProfilePurposeFields"></div>' +
        featureField(t('conn_profile_description'), 'connectionProfileDescription', draft.description, 'textarea');
    var dialog = openFeatureDialog('connectionProfileEditor', editing ? t('conn_profile_edit') : t('conn_profile_new'), body, async function(editor) {
        var selectedPurpose = editing ? profile.purpose : editor.querySelector('#connectionProfilePurpose').value;
        var record = {
            id: draft.id || makeId(),
            name: editor.querySelector('#connectionProfileName').value.trim(),
            purpose: selectedPurpose,
            protocol: normalizeApiProtocol(editor.querySelector('#connectionProfileProtocol').value),
            endpoint: editor.querySelector('#connectionProfileEndpoint').value.trim(),
            model: editor.querySelector('#connectionProfileModel').value.trim(),
            description: editor.querySelector('#connectionProfileDescription').value.trim(),
            parameters: readConnectionProfileParameterFields(editor, selectedPurpose, draft.parameters)
        };
        validateConnectionProfileRecord(record);
        var endpointChanged = editing && connectionProfileEndpointStamp(record.protocol, record.endpoint) !== connectionProfileEndpointStamp(profile.protocol, profile.endpoint);
        var apiKey = editor.querySelector('#connectionProfileApiKey').value.trim();
        var clearKey = editor.querySelector('#connectionProfileClearKey').checked;
        var keepCredential = !clearKey && !apiKey && !endpointChanged;
        try {
            if (!keepCredential) setConnectionProfileCredential(record, clearKey || endpointChanged ? '' : apiKey);
            await saveConnectionProfileChange(function(candidate, profiles) {
                var index = profiles.findIndex(function(item) { return item.id === record.id; });
                if (index >= 0) profiles[index] = record;
                else profiles.push(record);
                return record.id;
            });
        } catch (error) {
            if (editing) {
                try { setConnectionProfileCredential(profile, originalCredential); } catch (_) {}
            }
            else deleteConnectionProfileCredential(record.id);
            throw error;
        }
        bumpConnectionProfileDraftRevision();
        hydrateConnectionProfileControls();
        if (connectionProfileManagerRefresh) connectionProfileManagerRefresh();
    }, { lockWhileSaving: true });
    function renderPurposeFields() {
        var selectedPurpose = editing ? profile.purpose : dialog.querySelector('#connectionProfilePurpose').value;
        var host = dialog.querySelector('#connectionProfilePurposeFields');
        if (selectedPurpose === 'main') {
            host.innerHTML = '<div class="feature-grid">' +
                connectionProfileParameterField(draft, 'temperature', 'conn_profile_temperature', 0, 2, 0.05) +
                connectionProfileParameterField(draft, 'topP', 'conn_profile_top_p', 0, 1, 0.05) +
                connectionProfileParameterField(draft, 'maxTokens', 'conn_profile_max_tokens', 1, 1000000, 1) +
                connectionProfileParameterField(draft, 'contextLength', 'conn_profile_context_length', 1, 10000, 1) +
                connectionProfileParameterField(draft, 'frequencyPenalty', 'conn_profile_frequency_penalty', -2, 2, 0.05) +
                connectionProfileParameterField(draft, 'presencePenalty', 'conn_profile_presence_penalty', -2, 2, 0.05) +
                '</div>' + featureSelect(t('conn_profile_prompt_preset'), 'connectionProfilePreset', draft.parameters && draft.parameters.presetId || '', presetChoices);
        } else if (selectedPurpose === 'summary') {
            host.innerHTML = '<label class="feature-check"><input id="connectionProfileUseMain" type="checkbox"' + (draft.parameters && draft.parameters.useMain ? ' checked' : '') + '>' + escapeHtml(t('conn_profile_uses_main')) + '</label>' +
                '<div class="feature-grid">' +
                connectionProfileParameterField(draft, 'summaryTemperature', 'conn_profile_temperature', 0, 2, 0.05) +
                featureSelect(t('conn_profile_summary_prompt_mode'), 'connectionProfileSummaryPromptMode', draft.parameters && draft.parameters.summaryPromptMode || 'standard', [['standard', t('conn_profile_summary_standard')], ['custom', t('conn_profile_summary_custom')]]) +
                '</div><p class="feature-hint">' + escapeHtml(t('conn_profile_summary_use_main_hint')) + '</p>';
        } else {
            host.innerHTML = '<div class="feature-grid">' +
                connectionProfileParameterField(draft, 'embeddingDimensions', 'conn_profile_embedding_dimensions', 0, 100000, 1) +
                '</div><p class="feature-hint">' + escapeHtml(t('conn_profile_embedding_stage_hint')) + '</p>';
        }
        bumpConnectionProfileDraftRevision();
    }
    if (!editing) dialog.querySelector('#connectionProfilePurpose').addEventListener('change', renderPurposeFields);
    dialog.addEventListener('input', function() { bumpConnectionProfileDraftRevision(); });
    dialog.addEventListener('change', function() { bumpConnectionProfileDraftRevision(); });
    dialog.addEventListener('close', function() { bumpConnectionProfileDraftRevision(); });
    dialog.querySelector('#connectionProfileDiscoverModels').onclick = async function() {
        var button = dialog.querySelector('#connectionProfileDiscoverModels');
        var status = dialog.querySelector('#connectionProfileDiscoverStatus');
        var selectedPurpose = editing ? profile.purpose : dialog.querySelector('#connectionProfilePurpose').value;
        var candidate = readConnectionProfileDraftForDiscovery(dialog, selectedPurpose, draft);
        var requestRevision = bumpConnectionProfileDraftRevision();
        button.disabled = true;
        status.textContent = t('conn_profile_discovering');
        try {
            var result = await testConnectionProfileModels(candidate, requestRevision);
            if (result.stale) return;
            if (!result.ok) throw new Error(result.error || t('conn_profile_discover_failed'));
            var list = dialog.querySelector('#connectionProfileModelList');
            list.replaceChildren();
            (result.models || []).forEach(function(model) {
                var option = document.createElement('option');
                option.value = model;
                list.appendChild(option);
            });
            status.textContent = result.models && result.models.length ? t('conn_profile_models_found') : t('conn_profile_models_empty');
        } catch (error) {
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    };
    renderPurposeFields();
    return dialog;
}

function readConnectionProfileDraftForDiscovery(dialog, purpose, base) {
    return {
        id: base.id || 'connection-profile-discovery',
        name: dialog.querySelector('#connectionProfileName').value.trim() || t('conn_profile_discovery_name'),
        purpose: purpose,
        protocol: normalizeApiProtocol(dialog.querySelector('#connectionProfileProtocol').value),
        endpoint: dialog.querySelector('#connectionProfileEndpoint').value.trim(),
        model: dialog.querySelector('#connectionProfileModel').value.trim() || 'model',
        description: dialog.querySelector('#connectionProfileDescription').value,
        parameters: JSON.parse(JSON.stringify(base.parameters || {}))
    };
}

function readConnectionProfileParameterFields(editor, purpose, base) {
    var parameters = JSON.parse(JSON.stringify(base || {}));
    if (purpose === 'main') {
        parameters.temperature = featureNumber(editor, 'connectionProfileParam_temperature', 0, 2, false);
        parameters.topP = featureNumber(editor, 'connectionProfileParam_topP', 0, 1, false);
        parameters.maxTokens = featureNumber(editor, 'connectionProfileParam_maxTokens', 1, 1000000, true);
        parameters.contextLength = featureNumber(editor, 'connectionProfileParam_contextLength', 1, 10000, true);
        parameters.frequencyPenalty = featureNumber(editor, 'connectionProfileParam_frequencyPenalty', -2, 2, false);
        parameters.presencePenalty = featureNumber(editor, 'connectionProfileParam_presencePenalty', -2, 2, false);
        parameters.presetId = editor.querySelector('#connectionProfilePreset').value || '';
    } else if (purpose === 'summary') {
        parameters.useMain = editor.querySelector('#connectionProfileUseMain').checked;
        parameters.summaryTemperature = featureNumber(editor, 'connectionProfileParam_summaryTemperature', 0, 2, false);
        parameters.summaryPromptMode = editor.querySelector('#connectionProfileSummaryPromptMode').value;
    } else {
        parameters.embeddingDimensions = featureNumber(editor, 'connectionProfileParam_embeddingDimensions', 0, 100000, true);
    }
    return normalizeConnectionProfileParameters(parameters, purpose);
}

function syncConnectionProfileSettingsFormForKeys(keys) {
    if (typeof settingsFormDraft === 'undefined' || !settingsFormDraft) return;
    keys.forEach(function(key) {
        settingsFormDraft[key] = copySettingsValue(state.settings[key]);
        settingsFormBaseline[key] = copySettingsValue(state.settings[key]);
        settingsFormStateBaseline[key] = copySettingsValue(state.settings[key]);
    });
    var map = {
        apiProtocol: 'apiProtocol', apiEndpoint: 'apiEndpoint', apiKey: 'apiKey', model: 'modelName',
        maxTokens: 'maxTokens', temperature: 'temperature', topP: 'topP', frequencyPenalty: 'frequencyPenalty',
        presencePenalty: 'presencePenalty', contextLength: 'contextLength'
    };
    keys.forEach(function(key) {
        var id = map[key];
        var control = id && dom && dom[id];
        if (control && key !== 'reasoningEffort' && key !== 'thinking' && key !== 'modelContextCapacity') control.value = state.settings[key];
    });
    [['temperature', 'tempVal'], ['maxTokens', 'maxTokensVal'], ['contextLength', 'contextLenVal'], ['frequencyPenalty', 'frequencyPenaltyVal'], ['presencePenalty', 'presencePenaltyVal'], ['topP', 'topPVal']].forEach(function(pair) {
        if (keys.indexOf(pair[0]) >= 0 && dom && dom[pair[1]]) dom[pair[1]].textContent = String(state.settings[pair[0]]);
    });
    if (keys.indexOf('summarizeApiEndpoint') >= 0 && dom.summarizeApiEndpoint) dom.summarizeApiEndpoint.value = state.settings.summarizeApiEndpoint || '';
    if (keys.indexOf('summarizeApiKey') >= 0 && dom.summarizeApiKey) dom.summarizeApiKey.value = state.settings.summarizeApiKey || '';
    if (keys.indexOf('summarizeModel') >= 0 && dom.summarizeModel) dom.summarizeModel.value = state.settings.summarizeModel || '';
    if (keys.indexOf('summarizeUseMainAPI') >= 0 && dom.summarizeUseMainAPI) dom.summarizeUseMainAPI.checked = state.settings.summarizeUseMainAPI !== false;
    if (keys.indexOf('summaryTemperature') >= 0 && dom.summaryTemperature) dom.summaryTemperature.value = state.settings.summaryTemperature;
    if (keys.indexOf('summaryPromptMode') >= 0 && dom.summaryPromptMode) dom.summaryPromptMode.value = state.settings.summaryPromptMode;
    if (keys.indexOf('summaryReasoningEffort') >= 0 && dom.summaryReasoningEffort) dom.summaryReasoningEffort.value = state.settings.summaryReasoningEffort || '';
    if (keys.indexOf('sillyTavernPreset') >= 0 && typeof renderSillyTavernPresetSettings === 'function') renderSillyTavernPresetSettings();
}

function refreshConnectionProfileUiAfterApply(keys) {
    syncConnectionProfileSettingsFormForKeys(keys || []);
    hydrateConnectionProfileControls();
    if (typeof toggleSummarizeCustomSection === 'function') toggleSummarizeCustomSection();
}

function bindConnectionProfileEvents() {
    var manage = document.getElementById('manageConnectionProfilesBtn');
    if (manage) manage.onclick = function() { openConnectionProfileManager('main'); };
    CONNECTION_PROFILE_PURPOSES.forEach(function(purpose) {
        var manageButton = document.getElementById('manage' + purpose.charAt(0).toUpperCase() + purpose.slice(1) + 'ConnectionProfilesBtn');
        if (manageButton) manageButton.onclick = function() { openConnectionProfileManager(purpose); };
    });
    hydrateConnectionProfileControls();
}
