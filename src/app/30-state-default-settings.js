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
function defaultSettings() {
    return {
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        saveApiKey: false,
        ollamaCompatMode: false,
        model: 'gpt-4o',
        contextLength: 20,
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
        userName: 'User',
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
        lang: 'zh-CN',
        summaryEnabled: true,
        autoSummarizeOnReply: false,
        summaryThreshold: 12,
        summaryMaxWords: 0,
        summaryPrompt: '',
        worldInfoBudgetEnabled: true,
        worldInfoBudget: 2048,
        uiTheme: 'new-light',
        lowPowerMode: false,
        summarizeUseMainAPI: true,
        summarizeApiEndpoint: '',
        summarizeApiKey: '',
        summarizeModel: 'deepseek-chat',
        inferenceBackend: 'remote-api',
        webllmModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        comfyEnabled: false,
        comfyServer: 'http://127.0.0.1:8188',
        comfyWorkflow: null,
        comfyWorkflowName: '',
        comfyPositiveNodeId: '',
        comfyNegativeNodeId: '',
        comfySeedNodeId: '',
        comfyNegativePrompt: 'low quality, blurry, bad anatomy, bad hands',
        comfyPromptTemplate: 'masterpiece, best quality, anime style, {{char}}, {{scene}}',
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
