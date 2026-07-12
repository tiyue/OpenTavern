/**
 * 新手导读（文件：34-state-init-settings.js）
 *
 * 负责什么：这是“应用状态初始化”中的“状态、初始化、设置”部分。
 * 在程序中的位置：它读取保存的数据、修复旧格式，并保证至少有一个可用会话。
 * 从哪里开始看：主要从 `ensureStateSettingDefaults(无参数)`、`applyStartupUiPreferences(无参数)`、`applyApiKeyPersistencePolicy(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化发生在界面可用之前，异常必须转成安全默认状态而不是中断启动。
 */
// ==================== State Initialization Settings Helpers ====================
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
    if (!Array.isArray(state.settings.myCardOrder)) {
        state.settings.myCardOrder = [];
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
