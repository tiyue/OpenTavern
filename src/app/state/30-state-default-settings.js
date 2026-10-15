/**
 * 新手导读（文件：30-state-default-settings.js）
 *
 * 负责什么：这是“应用状态核心”中的“状态、默认值、设置”部分。
 * 在程序中的位置：它定义全局状态、默认设置以及会话增删改查入口。
 * 从哪里开始看：主要从 `defaultSettings(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：状态字段会被持久化；新增字段时要同时考虑默认值和旧快照规范化。
 */
// ==================== Default Settings ====================
var STREAM_TEXT_ANIM_EFFECTS = {
    fade: true,
    rise: true,
    slide: true,
    scale: true,
    drop: true
};

function clampInterfaceSettingNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.min(max, Math.max(min, number));
}

function normalizeStreamIdleTimeoutSec(value) {
    var seconds = parseInt(value, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    if (seconds < 15) return 15;
    return Math.round(clampInterfaceSettingNumber(seconds, 15, 300, 0));
}

function ensureInterfaceBehaviorSettings(settings) {
    if (!settings || typeof settings !== 'object') return settings;
    if (typeof settings.showReplyAvatar !== 'boolean') settings.showReplyAvatar = false;
    if (typeof settings.showMsgTokenUsage !== 'boolean') settings.showMsgTokenUsage = false;
    if (typeof settings.submitWithCmdEnter !== 'boolean') settings.submitWithCmdEnter = true;
    if (typeof settings.streamEnabled !== 'boolean') settings.streamEnabled = true;
    if (typeof settings.streamTextAnimEnabled !== 'boolean') settings.streamTextAnimEnabled = false;
    if (!STREAM_TEXT_ANIM_EFFECTS[settings.streamTextAnimEffect]) settings.streamTextAnimEffect = 'rise';
    if (settings.streamTextAnimUnit !== 'char') settings.streamTextAnimUnit = 'token';
    settings.streamTextAnimDuration = Math.round(clampInterfaceSettingNumber(settings.streamTextAnimDuration, 50, 1000, 180));
    settings.streamTextAnimDistance = clampInterfaceSettingNumber(settings.streamTextAnimDistance, 0.05, 0.8, 0.8);
    settings.streamTextAnimScale = clampInterfaceSettingNumber(settings.streamTextAnimScale, 1.02, 1.4, 1.1);
    settings.streamTextAnimStagger = Math.round(clampInterfaceSettingNumber(settings.streamTextAnimStagger, 0, 40, 12));
    settings.streamIdleTimeoutSec = normalizeStreamIdleTimeoutSec(settings.streamIdleTimeoutSec);
    return settings;
}

function formatStreamIdleTimeoutLabel(value) {
    var seconds = normalizeStreamIdleTimeoutSec(value);
    return seconds > 0 ? seconds + 's' : t('settings_stream_idle_timeout_off');
}

function defaultSettings() {
    return {
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        saveApiKey: false,
        model: 'gpt-4o',
        apiModelCatalog: [],
        contextLength: 20,
        maxTokens: 8192,
        temperature: 0.7,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topP: 0.9,
        userName: 'User',
        userPersonas: [{ id: 'default', name: '默认设定', userName: 'User', description: '' }],
        activeUserPersonaId: 'default',
        systemPrompt: '',
        postHistoryInstructions: '',
        twoStageEnabled: false,
        twoStageTemperature: 0.3,
        twoStageTopP: 0.85,
        twoStageIncludeRecentContext: false,
        twoStageSystemPrompt: DEFAULT_TWO_STAGE_PROMPT,
        twoStagePostHistoryInstructions: '',
        requestCotEnabled: false,
        showCotEnabled: true,
        cotMode: 'auto',
        userDescription: '',
        sillyTavernPreset: defaultSillyTavernPreset(),
        globalRegexScripts: [],
        globalRegexEnabled: false,
        authorNote: { enabled: false, content: '', role: 'system', position: 'in_chat', depth: 4, interval: 1 },
        promptPostProcessing: 'auto',
        reasoningEffort: '',
        thinking: null,
        modelContextCapacity: 0,
        lang: 'zh-CN',
        summaryEnabled: true,
        autoSummarizeOnReply: false,
        summaryThreshold: 12,
        summaryMaxWords: 0,
        summaryPrompt: '',
        summaryTemperature: 0.3,
        summaryPromptMode: 'standard',
        summaryReasoningEffort: '',
        summaryThinking: null,
        worldInfoBudgetEnabled: true,
        worldInfoBudget: 2048,
        uiTheme: 'new-light',
        readingWidth: 'medium',
        readingFontSize: 'default',
        restoreLastChat: false,
        chatBackground: '',
        lowPowerMode: false,
        showReplyAvatar: false,
        showMsgTokenUsage: false,
        submitWithCmdEnter: true,
        streamEnabled: true,
        streamTextAnimEnabled: false,
        streamTextAnimEffect: 'rise',
        streamTextAnimUnit: 'token',
        streamTextAnimDuration: 180,
        streamTextAnimDistance: 0.8,
        streamTextAnimScale: 1.1,
        streamTextAnimStagger: 12,
        streamIdleTimeoutSec: 0,
        summarizeUseMainAPI: true,
        summarizeApiEndpoint: '',
        summarizeApiKey: '',
        summarizeModel: 'deepseek-chat',
        imageGenerationEnabled: false,
        imageGenerationEndpoint: '/api/image/generate',
        imageGenerationToken: '',
        imageGenerationSize: '1024x1024',
        imageGenerationStylePrompt: '画面中的人物均为二次元角色，整体参考《碧蓝档案》的高质量日系动画插画风格。',
        imageGenerationNegativePrompt: 'low quality, blurry, bad anatomy, bad hands, malformed text',
        imageGenerationPromptExtend: true,
        imageGenerationIncludeCharacter: true,
        imageGenerationIncludeContext: true,
        imageGenerationPromptTemplate: '{{character}}\n\n{{scene}}\n\n{{context}}',
        cloudSyncEnabled: false,
        cloudSyncAutoUpload: false,
        cloudSyncEndpoint: '/api/sync',
        cloudSyncToken: '',
        cloudSyncEncrypted: false,
        cloudSyncPassphrase: '',
        cloudSyncLastAt: 0,
        cloudSyncLastStatus: '',
        myCardOrder: []
    };
}
