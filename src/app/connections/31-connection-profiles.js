// Named connection profiles keep portable descriptors in settings and credentials on this device only.
var CONNECTION_PROFILE_PURPOSES = ['main', 'summary', 'embedding'];
var CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY = 'opentavern_connection_profile_credentials';
var CONNECTION_PROFILE_MAIN_PARAMETER_KEYS = ['temperature', 'topP', 'maxTokens', 'contextLength', 'frequencyPenalty', 'presencePenalty', 'reasoningEffort', 'thinking', 'modelContextCapacity', 'presetId'];
var CONNECTION_PROFILE_SUMMARY_PARAMETER_KEYS = ['useMain', 'summaryTemperature', 'summaryPromptMode', 'summaryReasoningEffort', 'summaryThinking'];
var CONNECTION_PROFILE_EMBEDDING_PARAMETER_KEYS = ['embeddingDimensions', 'description'];
var connectionProfileCredentialMemory = Object.create(null);
var connectionProfileCredentialStoreLoaded = false;
var connectionProfileDraftRevision = 0;
var failedConnectionProfileDraft = null;

function normalizeConnectionProfilePurpose(value) {
    value = String(value || '').toLowerCase();
    return CONNECTION_PROFILE_PURPOSES.indexOf(value) >= 0 ? value : '';
}

function connectionProfileParameterKeys(purpose) {
    if (purpose === 'main') return CONNECTION_PROFILE_MAIN_PARAMETER_KEYS;
    if (purpose === 'summary') return CONNECTION_PROFILE_SUMMARY_PARAMETER_KEYS;
    return CONNECTION_PROFILE_EMBEDDING_PARAMETER_KEYS;
}

function connectionProfileEndpointStamp(protocol, endpoint) {
    return normalizeApiProtocol(protocol) + '\n' + String(endpoint || '').trim();
}

function normalizeConnectionProfileParameters(value, purpose) {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var result = {};
    connectionProfileParameterKeys(purpose).forEach(function(key) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) return;
        var item = value[key];
        if (key === 'thinking' || key === 'summaryThinking') {
            if (item === null) result[key] = null;
            else if (item && typeof item === 'object' && !Array.isArray(item)) result[key] = JSON.parse(JSON.stringify(item));
            return;
        }
        if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
        else if (typeof item === 'boolean') result[key] = item;
        else if (typeof item === 'string') result[key] = item.slice(0, key === 'description' ? 2000 : 500);
    });
    if (purpose === 'main') {
        if (typeof result.temperature !== 'number') result.temperature = 0.7;
        if (typeof result.topP !== 'number') result.topP = 0.9;
        if (!Number.isFinite(result.maxTokens)) result.maxTokens = 8192;
        if (!Number.isFinite(result.contextLength)) result.contextLength = 20;
        if (!Number.isFinite(result.frequencyPenalty)) result.frequencyPenalty = 0;
        if (!Number.isFinite(result.presencePenalty)) result.presencePenalty = 0;
    } else if (purpose === 'summary') {
        if (typeof result.useMain !== 'boolean') result.useMain = false;
        if (typeof result.summaryTemperature !== 'number') result.summaryTemperature = 0.3;
        if (typeof result.summaryPromptMode !== 'string') result.summaryPromptMode = 'standard';
    } else if (purpose === 'embedding') {
        if (!Number.isFinite(result.embeddingDimensions)) result.embeddingDimensions = 0;
    }
    return result;
}

function normalizeConnectionProfileRecord(profile, index, usedIds) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    var purpose = normalizeConnectionProfilePurpose(profile.purpose);
    if (!purpose) return null;
    var id = String(profile.id || '').trim();
    if (!id || usedIds[id]) {
        id = 'connection-profile-' + purpose + '-' + Date.now().toString(36) + '-' + index;
        while (usedIds[id]) id += '-copy';
    }
    usedIds[id] = true;
    var name = String(profile.name || '').trim().slice(0, 120) || t('conn_profile_unnamed');
    return {
        id: id,
        name: name,
        purpose: purpose,
        protocol: normalizeApiProtocol(profile.protocol),
        endpoint: String(profile.endpoint || '').trim().slice(0, 2000),
        model: String(profile.model || '').trim().slice(0, 500),
        description: String(profile.description || '').trim().slice(0, 2000),
        parameters: normalizeConnectionProfileParameters(profile.parameters, purpose)
    };
}

function getLegacyConnectionProfileRecord(purpose, usedIds) {
    var settings = state.settings || {};
    var id = 'legacy-' + purpose + '-connection';
    var suffix = 1;
    while (usedIds[id]) id = 'legacy-' + purpose + '-connection-' + ++suffix;
    if (purpose === 'main') {
        return normalizeConnectionProfileRecord({
            id: id, name: t('conn_profile_main_legacy_name'), purpose: purpose,
            protocol: settings.apiProtocol || 'openai', endpoint: settings.apiEndpoint || '',
            model: settings.model || '',
            parameters: {
                temperature: settings.temperature, topP: settings.topP, maxTokens: settings.maxTokens,
                contextLength: settings.contextLength, frequencyPenalty: settings.frequencyPenalty,
                presencePenalty: settings.presencePenalty, reasoningEffort: settings.reasoningEffort || '',
                thinking: settings.thinking, modelContextCapacity: settings.modelContextCapacity,
                presetId: settings.activePresetId || ''
            }
        }, 0, usedIds);
    }
    if (purpose === 'summary') {
        var useMain = settings.summarizeUseMainAPI !== false;
        return normalizeConnectionProfileRecord({
            id: id, name: t('conn_profile_summary_legacy_name'), purpose: purpose,
            protocol: useMain ? settings.apiProtocol : (settings.summarizeApiProtocol || settings.apiProtocol),
            endpoint: useMain ? settings.apiEndpoint : (settings.summarizeApiEndpoint || ''),
            model: useMain ? settings.model : (settings.summarizeModel || ''),
            parameters: {
                useMain: useMain, summaryTemperature: settings.summaryTemperature,
                summaryPromptMode: settings.summaryPromptMode,
                summaryReasoningEffort: settings.summaryReasoningEffort || '',
                summaryThinking: settings.summaryThinking
            }
        }, 0, usedIds);
    }
    return normalizeConnectionProfileRecord({
        id: id, name: t('conn_profile_embedding_legacy_name'), purpose: purpose,
        protocol: 'openai', endpoint: '', model: '',
        description: t('conn_profile_embedding_legacy_description'), parameters: {}
    }, 0, usedIds);
}

function ensureConnectionProfiles(settings) {
    settings = settings || state.settings;
    if (!settings || typeof settings !== 'object') return [];
    if (!Array.isArray(settings.connectionProfiles) || !settings.connectionProfiles.length) settings.connectionProfiles = [];
    var usedIds = Object.create(null);
    var normalized = [];
    settings.connectionProfiles.forEach(function(profile, index) {
        var record = normalizeConnectionProfileRecord(profile, index, usedIds);
        if (record) normalized.push(record);
    });
    var created = Object.create(null);
    CONNECTION_PROFILE_PURPOSES.forEach(function(purpose) {
        if (normalized.some(function(profile) { return profile.purpose === purpose; })) return;
        var legacy = getLegacyConnectionProfileRecord(purpose, usedIds);
        if (legacy) { normalized.push(legacy); created[purpose] = legacy.id; }
    });
    settings.connectionProfiles = normalized;
    var ids = settings.activeConnectionProfileIds;
    if (!ids || typeof ids !== 'object' || Array.isArray(ids)) ids = settings.activeConnectionProfileIds = {};
    CONNECTION_PROFILE_PURPOSES.forEach(function(purpose) {
        if (!Object.prototype.hasOwnProperty.call(ids, purpose)) ids[purpose] = '';
        if (!ids[purpose] && created[purpose]) ids[purpose] = created[purpose];
        if (ids[purpose] && !normalized.some(function(profile) { return profile.id === ids[purpose] && profile.purpose === purpose; })) {
            // Keep the dangling reference visible so the UI can ask for an explicit replacement
            // instead of silently switching the model or service.
            ids[purpose] = String(ids[purpose] || '');
        }
    });
    return normalized;
}

function getConnectionProfilesByPurpose(purpose) {
    ensureConnectionProfiles(state.settings);
    return (state.settings.connectionProfiles || []).filter(function(profile) { return profile.purpose === purpose; });
}

function getConnectionProfileById(id) {
    ensureConnectionProfiles(state.settings);
    return (state.settings.connectionProfiles || []).find(function(profile) { return profile.id === id; }) || null;
}

function getActiveConnectionProfile(purpose) {
    ensureConnectionProfiles(state.settings);
    var ids = state.settings.activeConnectionProfileIds || {};
    var profile = getConnectionProfileById(ids[purpose]);
    return profile && profile.purpose === purpose ? profile : null;
}

function validateConnectionProfileRecord(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(t('conn_profile_invalid'));
    if (!normalizeConnectionProfilePurpose(profile.purpose)) throw new Error(t('conn_profile_invalid_purpose'));
    if (!String(profile.name || '').trim()) throw new Error(t('conn_profile_name_required'));
    if (profile.purpose !== 'embedding') {
        var usesMain = profile.purpose === 'summary' && profile.parameters && profile.parameters.useMain === true;
        if (!usesMain && !String(profile.endpoint || '').trim()) throw new Error(t('conn_profile_endpoint_required'));
        if (!usesMain && !String(profile.model || '').trim()) throw new Error(t('conn_profile_model_required'));
    }
    var parameters = profile.parameters || {};
    if (profile.purpose === 'main') {
        if (parameters.temperature < 0 || parameters.temperature > 2) throw new Error(t('conn_profile_temperature_invalid'));
        if (parameters.topP < 0 || parameters.topP > 1) throw new Error(t('conn_profile_top_p_invalid'));
        if (!Number.isInteger(parameters.maxTokens) || parameters.maxTokens < 1) throw new Error(t('conn_profile_max_tokens_invalid'));
        if (!Number.isInteger(parameters.contextLength) || parameters.contextLength < 1) throw new Error(t('conn_profile_context_invalid'));
    }
    if (profile.purpose === 'summary' && parameters.summaryTemperature != null && (parameters.summaryTemperature < 0 || parameters.summaryTemperature > 2)) {
        throw new Error(t('conn_profile_temperature_invalid'));
    }
    return profile;
}

function loadConnectionProfileCredentialStore() {
    if (connectionProfileCredentialStoreLoaded) return;
    connectionProfileCredentialStoreLoaded = true;
    try {
        if (typeof localStorage === 'undefined') return;
        var raw = localStorage.getItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        Object.keys(parsed).forEach(function(id) {
            var item = parsed[id];
            if (!item || typeof item !== 'object' || typeof item.key !== 'string') return;
            connectionProfileCredentialMemory[id] = {
                protocol: normalizeApiProtocol(item.protocol),
                endpoint: String(item.endpoint || '').trim(),
                key: item.key
            };
        });
    } catch (_) {}
}

function persistConnectionProfileCredentialStore() {
    if (typeof localStorage === 'undefined') return;
    if (!state.settings || !state.settings.saveApiKey) {
        // Memory-only credentials still work when the device store cannot be cleared.
        try { localStorage.removeItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY); } catch (_) {}
        return;
    }
    var store = {};
    Object.keys(connectionProfileCredentialMemory).forEach(function(id) {
        var item = connectionProfileCredentialMemory[id];
        if (!item || !item.key || !item.endpoint) return;
        store[id] = { protocol: normalizeApiProtocol(item.protocol), endpoint: item.endpoint, key: item.key };
    });
    var payload = Object.keys(store).length ? JSON.stringify(store) : '';
    try {
        if (payload) localStorage.setItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY, payload);
        else localStorage.removeItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY);
        if (payload && localStorage.getItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY) !== payload) throw new Error('readback');
    } catch (error) {
        throw new Error(t('conn_profile_credential_save_failed'));
    }
}

function getConnectionProfileCredential(profile) {
    if (!profile || !profile.id) return '';
    loadConnectionProfileCredentialStore();
    var item = connectionProfileCredentialMemory[profile.id];
    if (!item || !item.key) return '';
    if (connectionProfileEndpointStamp(item.protocol, item.endpoint) !== connectionProfileEndpointStamp(profile.protocol, profile.endpoint)) return '';
    return String(item.key || '');
}

function hasConnectionProfileCredential(profile) {
    return !!getConnectionProfileCredential(profile);
}

function setConnectionProfileCredential(profile, apiKey) {
    if (!profile || !profile.id) return;
    loadConnectionProfileCredentialStore();
    var key = String(apiKey || '').trim();
    var previous = connectionProfileCredentialMemory[profile.id];
    if (!key) {
        delete connectionProfileCredentialMemory[profile.id];
    } else {
        connectionProfileCredentialMemory[profile.id] = {
            protocol: normalizeApiProtocol(profile.protocol),
            endpoint: String(profile.endpoint || '').trim(),
            key: key
        };
    }
    try {
        persistConnectionProfileCredentialStore();
    } catch (error) {
        if (previous) connectionProfileCredentialMemory[profile.id] = previous;
        else delete connectionProfileCredentialMemory[profile.id];
        throw error;
    }
}

function deleteConnectionProfileCredential(id) {
    loadConnectionProfileCredentialStore();
    delete connectionProfileCredentialMemory[id];
    try { persistConnectionProfileCredentialStore(); } catch (_) {}
}

function enforceConnectionProfileCredentialPersistencePolicy() {
    loadConnectionProfileCredentialStore();
    if (!state.settings || !state.settings.saveApiKey) {
        try { if (typeof localStorage !== 'undefined') localStorage.removeItem(CONNECTION_PROFILE_CREDENTIAL_STORAGE_KEY); } catch (_) {}
        return;
    }
    // Startup/settings-close sweep: explicit editor saves already report failures, so a broken
    // device store must not block the rest of the close path.
    try { persistConnectionProfileCredentialStore(); } catch (error) { console.warn('[ConnectionProfiles] Credential store sweep failed:', error.message); }
}

function legacyConnectionProfileCredentialMatches(profile, protocol, endpoint) {
    if (!profile || !String(endpoint || '').trim()) return false;
    return connectionProfileEndpointStamp(profile.protocol, profile.endpoint) === connectionProfileEndpointStamp(protocol, endpoint);
}

function migrateLegacyConnectionProfileCredentials() {
    ensureConnectionProfiles(state.settings);
    var settings = state.settings || {};
    var main = getActiveConnectionProfile('main');
    if (main && settings.apiKey && !getConnectionProfileCredential(main) &&
        legacyConnectionProfileCredentialMatches(main, settings.apiProtocol || 'openai', settings.apiEndpoint)) {
        setConnectionProfileCredential(main, settings.apiKey);
    }
    var summary = getActiveConnectionProfile('summary');
    if (summary && settings.summarizeUseMainAPI === false && settings.summarizeApiKey && !getConnectionProfileCredential(summary) &&
        legacyConnectionProfileCredentialMatches(summary, settings.summarizeApiProtocol || settings.apiProtocol, settings.summarizeApiEndpoint)) {
        setConnectionProfileCredential(summary, settings.summarizeApiKey);
    }
}

function buildConnectionProfileProjection(profile) {
    var patch = {};
    if (!profile) return patch;
    var parameters = profile.parameters || {};
    if (profile.purpose === 'main') {
        patch.apiProtocol = normalizeApiProtocol(profile.protocol);
        patch.apiEndpoint = String(profile.endpoint || '').trim();
        patch.apiKey = getConnectionProfileCredential(profile);
        patch.model = String(profile.model || '').trim();
        ['temperature', 'topP', 'maxTokens', 'contextLength', 'frequencyPenalty', 'presencePenalty', 'reasoningEffort', 'thinking', 'modelContextCapacity'].forEach(function(key) {
            if (parameters[key] !== undefined) patch[key] = JSON.parse(JSON.stringify(parameters[key]));
        });
        var presetId = String(parameters.presetId || '');
        if (presetId) {
            ensurePresetLibrary(state.settings);
            var preset = (state.settings.presetLibrary || []).find(function(item) { return item.id === presetId; });
            if (!preset) throw new Error(t('conn_profile_preset_missing'));
            patch.activePresetId = presetId;
            patch.sillyTavernPreset = JSON.parse(JSON.stringify(preset));
        }
    } else if (profile.purpose === 'summary') {
        patch.summarizeUseMainAPI = parameters.useMain === true;
        if (parameters.useMain === true) {
            patch.summarizeApiProtocol = '';
            patch.summarizeApiEndpoint = '';
            patch.summarizeApiKey = '';
        } else {
            patch.summarizeApiProtocol = normalizeApiProtocol(profile.protocol);
            patch.summarizeApiEndpoint = String(profile.endpoint || '').trim();
            patch.summarizeApiKey = getConnectionProfileCredential(profile);
            patch.summarizeModel = String(profile.model || '').trim();
        }
        if (parameters.summaryTemperature !== undefined) patch.summaryTemperature = parameters.summaryTemperature;
        if (parameters.summaryPromptMode !== undefined) patch.summaryPromptMode = parameters.summaryPromptMode;
        if (parameters.summaryReasoningEffort !== undefined) patch.summaryReasoningEffort = parameters.summaryReasoningEffort;
        if (parameters.summaryThinking !== undefined) patch.summaryThinking = JSON.parse(JSON.stringify(parameters.summaryThinking));
    }
    return patch;
}

function assertConnectionProfileSettingsAvailable() {
    if (state.isGenerating || state._promptBuildPendingSequence || state._promptBuildOperation) throw new Error(t('conn_profile_wait_generation'));
    if (typeof isBackupRestorePending === 'function' && isBackupRestorePending()) throw new Error(t('conn_profile_storage_busy'));
    if (typeof cloudSyncActiveOperations !== 'undefined' && cloudSyncActiveOperations > 0) throw new Error(t('conn_profile_storage_busy'));
}

function assertConnectionProfileDraftCompatible(keys) {
    if (typeof settingsFormDraft === 'undefined' || !settingsFormDraft || !settingsFormBaseline) return;
    keys.forEach(function(key) {
        if (!settingsValueEqual(settingsFormDraft[key], settingsFormBaseline[key])) throw new Error(t('conn_profile_settings_draft_conflict'));
        if (!settingsValueEqual(state.settings[key], settingsFormStateBaseline && settingsFormStateBaseline[key])) throw new Error(t('conn_profile_settings_draft_conflict'));
    });
}

function applyConnectionProfileSnapshotPolicy(snapshotSettings) {
    if (!snapshotSettings || typeof snapshotSettings !== 'object') return snapshotSettings;
    if (!snapshotSettings.saveApiKey) {
        snapshotSettings.apiKey = '';
        snapshotSettings.summarizeApiKey = '';
    }
    if (Array.isArray(snapshotSettings.connectionProfiles) && typeof getPortableConnectionProfileList === 'function') {
        snapshotSettings.connectionProfiles = getPortableConnectionProfileList(snapshotSettings.connectionProfiles);
    }
    return snapshotSettings;
}

async function commitConnectionProfileSettingsKeys(candidate, keys) {
    ensureConnectionProfiles(candidate);
    keys = Array.from(new Set(keys || []));
    var root = state.settings;
    var baseline = JSON.stringify(keys.map(function(key) { return state.settings[key]; }));
    function check() {
        if (state.settings !== root) throw new Error(t('conn_profile_settings_replaced'));
        if (JSON.stringify(keys.map(function(key) { return state.settings[key]; })) !== baseline) throw new Error(t('conn_profile_settings_changed'));
        assertConnectionProfileSettingsAvailable();
    }
    function merge(snapshot) {
        if (!snapshot.settings) snapshot.settings = {};
        keys.forEach(function(key) { snapshot.settings[key] = JSON.parse(JSON.stringify(candidate[key])); });
        applyConnectionProfileSnapshotPolicy(snapshot.settings);
        return snapshot;
    }
    try {
        assertConnectionProfileDraftCompatible(keys);
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: check,
            transformSnapshot: merge,
            onPersistSuccess: function() {
                check();
                keys.forEach(function(key) { state.settings[key] = JSON.parse(JSON.stringify(candidate[key])); });
                ensureConnectionProfiles(state.settings);
            },
            commitPendingSnapshot: function(snapshot) {
                if (JSON.stringify(keys.map(function(key) { return snapshot.settings && snapshot.settings[key]; })) === baseline) merge(snapshot);
            }
        });
        if (failedConnectionProfileDraft) failedConnectionProfileDraft = null;
        if (typeof refreshConnectionProfileUiAfterApply === 'function') refreshConnectionProfileUiAfterApply(keys);
        if (typeof updateInputState === 'function') updateInputState();
        if (typeof renderTokenBar === 'function') renderTokenBar();
        appStore.notify('settings');
    } catch (error) {
        failedConnectionProfileDraft = { candidate: candidate, keys: keys, root: root, baseline: baseline };
        throw error;
    }
}

async function applyConnectionProfileSelection(purpose, id) {
    if (failedConnectionProfileDraft) throw new Error(t('conn_profile_draft_pending'));
    purpose = normalizeConnectionProfilePurpose(purpose);
    if (!purpose) throw new Error(t('conn_profile_invalid_purpose'));
    assertConnectionProfileSettingsAvailable();
    var profile = getConnectionProfileById(id);
    if (!profile || profile.purpose !== purpose) throw new Error(t('conn_profile_missing'));
    validateConnectionProfileRecord(profile);
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureConnectionProfiles(candidate);
    var patch = buildConnectionProfileProjection(profile);
    Object.keys(patch).forEach(function(key) { candidate[key] = patch[key]; });
    candidate.activeConnectionProfileIds[purpose] = profile.id;
    var keys = Object.keys(patch).concat(['activeConnectionProfileIds']);
    await commitConnectionProfileSettingsKeys(candidate, keys);
    return profile;
}

async function saveConnectionProfileChange(mutator) {
    if (failedConnectionProfileDraft) throw new Error(t('conn_profile_draft_pending'));
    assertConnectionProfileSettingsAvailable();
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureConnectionProfiles(candidate);
    var changedProfileId = mutator(candidate, candidate.connectionProfiles) || '';
    ensureConnectionProfiles(candidate);
    candidate.connectionProfiles.forEach(validateConnectionProfileRecord);
    var keys = ['connectionProfiles', 'activeConnectionProfileIds'];
    var changed = candidate.connectionProfiles.find(function(profile) { return profile.id === changedProfileId; });
    if (changed) {
        var activeIds = candidate.activeConnectionProfileIds || {};
        if (activeIds[changed.purpose] === changed.id) {
            var projected = buildConnectionProfileProjection(changed);
            Object.keys(projected).forEach(function(key) { candidate[key] = projected[key]; });
            keys = keys.concat(Object.keys(projected));
        }
    }
    await commitConnectionProfileSettingsKeys(candidate, keys);
    return changed;
}

async function deleteConnectionProfile(id, replacements) {
    if (failedConnectionProfileDraft) throw new Error(t('conn_profile_draft_pending'));
    assertConnectionProfileSettingsAvailable();
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureConnectionProfiles(candidate);
    var target = candidate.connectionProfiles.find(function(profile) { return profile.id === id; });
    if (!target) throw new Error(t('conn_profile_missing'));
    var remaining = candidate.connectionProfiles.filter(function(profile) { return profile.id !== id; });
    if (!remaining.some(function(profile) { return profile.purpose === target.purpose; })) throw new Error(t('conn_profile_last_purpose'));
    replacements = replacements || {};
    var activeIds = candidate.activeConnectionProfileIds || {};
    var keys = ['connectionProfiles', 'activeConnectionProfileIds'];
    if (activeIds[target.purpose] === id) {
        var replacementId = String(replacements[target.purpose] || '');
        var replacement = remaining.find(function(profile) { return profile.id === replacementId && profile.purpose === target.purpose; });
        if (!replacement) throw new Error(t('conn_profile_replacement_required'));
        activeIds[target.purpose] = replacement.id;
        var projected = buildConnectionProfileProjection(replacement);
        Object.keys(projected).forEach(function(key) { candidate[key] = projected[key]; });
        keys = keys.concat(Object.keys(projected));
    }
    candidate.connectionProfiles = remaining;
    ensureConnectionProfiles(candidate);
    await commitConnectionProfileSettingsKeys(candidate, keys);
    deleteConnectionProfileCredential(id);
}

function cloneConnectionProfileForCopy(profile) {
    ensureConnectionProfiles(state.settings);
    var copy = JSON.parse(JSON.stringify(profile));
    copy.id = makeId();
    copy.name = (copy.name || t('conn_profile_unnamed')) + ' ' + t('conn_profile_copy_suffix');
    return copy;
}

function stripConnectionProfileSensitiveFields(value, depth) {
    depth = depth || 0;
    if (depth > 32) return undefined;
    if (Array.isArray(value)) return value.map(function(item) { return stripConnectionProfileSensitiveFields(item, depth + 1); });
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function(key) {
        if (['__proto__', 'constructor', 'prototype', 'credentialRef'].indexOf(key) >= 0) return;
        if (/(?:apiKey|api_key|token|secret|passphrase|password|credentials?|privateKey|authorization|headers)$/i.test(key)) return;
        var stripped = stripConnectionProfileSensitiveFields(value[key], depth + 1);
        if (stripped !== undefined) Object.defineProperty(result, key, { value: stripped, writable: true, enumerable: true, configurable: true });
    });
    return result;
}

function importConnectionProfilesData(raw) {
    var list = Array.isArray(raw) ? raw : raw && raw.type === 'opentavern-connection-profiles' ? raw.profiles : null;
    if (!Array.isArray(list) || !list.length || list.length > 100) throw new Error(t('conn_profile_import_invalid'));
    var usedIds = Object.create(null);
    return list.map(function(item, index) {
        var copy = stripConnectionProfileSensitiveFields(JSON.parse(JSON.stringify(item)));
        var record = normalizeConnectionProfileRecord(copy, index, usedIds);
        if (!record) throw new Error(t('conn_profile_import_invalid'));
        record.id = 'imported-' + record.purpose + '-' + makeId();
        usedIds[record.id] = true;
        validateConnectionProfileRecord(record);
        return record;
    });
}

function exportConnectionProfilesData() {
    ensureConnectionProfiles(state.settings);
    return {
        type: 'opentavern-connection-profiles',
        version: 1,
        profiles: state.settings.connectionProfiles.map(function(profile) {
            return {
                id: profile.id, name: profile.name, purpose: profile.purpose,
                protocol: profile.protocol, endpoint: profile.endpoint, model: profile.model,
                description: profile.description, parameters: JSON.parse(JSON.stringify(profile.parameters || {}))
            };
        })
    };
}

function bumpConnectionProfileDraftRevision() {
    connectionProfileDraftRevision++;
    return connectionProfileDraftRevision;
}

function getConnectionProfileDraftRevision() {
    return connectionProfileDraftRevision;
}

async function testConnectionProfileModels(profile, revision) {
    validateConnectionProfileRecord(profile);
    var endpoint = String(profile.endpoint || '').trim();
    if (!endpoint) throw new Error(t('conn_profile_endpoint_required'));
    revision = revision == null ? getConnectionProfileDraftRevision() : revision;
    var modelsUrl = deriveApiModelsEndpoint(endpoint, normalizeApiProtocol(profile.protocol));
    var tested = [];
    var result = await runApiModelsEndpointTest(modelsUrl, getConnectionProfileCredential(profile), tested, normalizeApiProtocol(profile.protocol));
    if (revision !== getConnectionProfileDraftRevision()) return { ok: false, stale: true, models: [] };
    return result;
}
