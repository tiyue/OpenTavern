// ==================== State Initialization Helpers ====================
async function loadInitialStateSnapshot() {
    var saved = null;

    try {
        saved = await StorageService.loadAll();
        if (saved) {
            console.log('[Storage] initState: loaded via StorageService, backend=', StorageService.getBackend());
        }
    } catch (e) {
        console.warn('[Storage] StorageService.loadAll error in initState, will try LS compat', e);
    }

    if (!saved) {
        var lsData = loadAll();
        if (lsData) saved = lsData;
    }

    return saved;
}

function applySavedStateSnapshot(saved) {
    if (!saved) {
        console.log('[Storage] No previous data found, starting fresh');
        return;
    }

    if (saved.settings) {
        Object.keys(saved.settings).forEach(function(key) {
            state.settings[key] = saved.settings[key];
        });
    }
    if (saved.conversations) state.conversations = saved.conversations;
    if (saved.conversationOrder) state.conversationOrder = saved.conversationOrder;
    if (saved.activeConvId && state.conversations[saved.activeConvId]) {
        state.activeConvId = saved.activeConvId;
    }
    if (saved.worldBooks) state.worldBooks = saved.worldBooks;
    if (saved.characters) state.characters = saved.characters;
    if (saved.charactersMigrated) state._charactersMigrated = true;
}

function logInitialStateLoadResult(saved, migrationResult) {
    console.log('[Storage] Final load state after init:', {
        conversationsCount: Object.keys(state.conversations || {}).length,
        activeConvId: state.activeConvId,
        loadedFrom: saved && saved._loadedFrom,
        migrationResult
    });
}

function ensureStateSettingDefaults() {
    if (!state.settings.lang) state.settings.lang = 'zh-CN';

    if (typeof state.settings.uiTheme === 'undefined') {
        state.settings.uiTheme = 'new-light';
    }
    if (typeof normalizeUiTheme === 'function') {
        state.settings.uiTheme = normalizeUiTheme(state.settings.uiTheme);
    }
    if (typeof cacheUiTheme === 'function') {
        cacheUiTheme(state.settings.uiTheme);
    }
    if (typeof state.settings.lowPowerMode === 'undefined') {
        state.settings.lowPowerMode = false;
    }
    if (typeof state.settings.ollamaCompatMode !== 'boolean') {
        state.settings.ollamaCompatMode = false;
    }
    if (typeof state.settings.twoStageEnabled !== 'boolean') {
        state.settings.twoStageEnabled = false;
    }
    if (typeof state.settings.twoStageTemperature !== 'number') {
        state.settings.twoStageTemperature = 0.3;
    }
    if (typeof state.settings.twoStageTopP !== 'number') {
        state.settings.twoStageTopP = 0.85;
    }
    if (typeof state.settings.twoStageIncludeRecentContext !== 'boolean') {
        state.settings.twoStageIncludeRecentContext = false;
    }
    if (!state.settings.twoStageSystemPrompt) {
        state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
    }
    if (typeof state.settings.requestCotEnabled !== 'boolean') {
        state.settings.requestCotEnabled = false;
    }
    if (typeof state.settings.showCotEnabled !== 'boolean') {
        state.settings.showCotEnabled = true;
    }
    if (typeof state.settings.postHistoryInstructions !== 'string') {
        state.settings.postHistoryInstructions = '';
    }
    if (typeof state.settings.twoStagePostHistoryInstructions !== 'string') {
        state.settings.twoStagePostHistoryInstructions = '';
    }
    if (typeof state.settings.summaryPrompt !== 'string') {
        state.settings.summaryPrompt = '';
    }
}

function applyStartupUiPreferences() {
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }

    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
}

function applyApiKeyPersistencePolicy() {
    var hadApiKey = !!(state.settings && state.settings.apiKey);
    if (typeof state.settings.saveApiKey === 'undefined') {
        state.settings.saveApiKey = hadApiKey;
    }
    if (!state.settings.saveApiKey) {
        state.settings.apiKey = '';
        state.settings.summarizeApiKey = '';
    }
}

function migrateCharacterRegistryOnStartup() {
    if (!state.characters) state.characters = {};
    if (state._charactersMigrated) return;

    migrateCharactersToRegistry(state.conversations || {});
    state._charactersMigrated = true;

    if (StorageService && StorageService._hasUserData && StorageService._hasUserData(state) && typeof persistState === 'function') {
        persistState(true);
    }
}

function ensureActiveConversationOnStartup() {
    var hasAnyConv = Object.keys(state.conversations || {}).length > 0;

    if (!state.activeConvId || !state.conversations[state.activeConvId]) {
        if (hasAnyConv) {
            recoverActiveConversationFromExistingData();
        }

        if (!state.activeConvId || !state.conversations[state.activeConvId]) {
            createStartupDefaultConversation();
        }
    }
}

function recoverActiveConversationFromExistingData() {
    var order = Array.isArray(state.conversationOrder) ? state.conversationOrder : [];
    var firstId = order.find(id => state.conversations[id]) || Object.keys(state.conversations)[0];
    if (firstId) {
        state.activeConvId = firstId;
        console.log('[Storage] Recovered activeConvId from existing conversations:', firstId);
    } else {
        state.activeConvId = null;
    }
}

function createStartupDefaultConversation() {
    console.log('[Storage] No valid conversations found, creating a brand new default one');
    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder.unshift(conv.id);
    state.activeConvId = conv.id;
}
