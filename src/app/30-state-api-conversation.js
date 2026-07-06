// ==================== 状态容器 + 手动通知机制 ====================
// 当前为非响应式设计（已移除 Proxy 自动响应）。
// 修改 state 后请显式调用 appStore.notify('key') 或直接调用对应的 renderXXXOnly() / requestRender()。
// 推荐做法：直接修改 state.xxx 后，显式调用 appStore.notify('xxx') 或直接调用对应 render 函数。
function createReactiveStore(initialState) {
    // 使用普通对象，不再使用 Proxy 做自动通知
    var state = JSON.parse(JSON.stringify(initialState || {}));

    var listeners = {};           // 'settings' -> Set<Function>
    var globalListeners = new Set();

    function notify(changedKeys) {
        // 通知特定 key 的监听者
        changedKeys.forEach(function(key) {
            if (listeners[key]) {
                listeners[key].forEach(function(fn) {
                    try { fn(key); } catch (e) { console.error(e); }
                });
            }
        });

        // 通知全局监听者
        globalListeners.forEach(function(fn) {
            try { fn(changedKeys); } catch (e) { console.error(e); }
        });
    }

    return {
        get state() {
            return state;
        },

        // 订阅某个 key 的变化，或订阅所有变化
        subscribe: function(keyOrFn, callback) {
            if (typeof keyOrFn === 'function') {
                // 全局订阅
                globalListeners.add(keyOrFn);
                return function unsubscribe() {
                    globalListeners.delete(keyOrFn);
                };
            }

            var key = keyOrFn;
            if (!listeners[key]) {
                listeners[key] = new Set();
            }
            listeners[key].add(callback);

            return function unsubscribe() {
                if (listeners[key]) {
                    listeners[key].delete(callback);
                }
            };
        },

        // 手动触发通知（推荐在修改深层状态后调用）
        notify: function(keys) {
            var arr = Array.isArray(keys) ? keys : [keys];
            notify(arr);
        }
    };
}

// ==================== Default State ====================
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
        // 超过设定轮数后自动总结旧消息并注入上下文（主功能，默认开启）
        summaryEnabled: true,
        // 每次 AI 回复后自动触发总结检查（默认关闭，由用户自行决定是否启用自动生成）
        autoSummarizeOnReply: false,
        summaryThreshold: 12,
        summaryMaxWords: 0,
        summaryPrompt: '',
        // World Info (World Book) budget control
        worldInfoBudgetEnabled: true,
        worldInfoBudget: 2048,

        // 界面主题（classic / new-light / new-dark）
        uiTheme: 'new-light',

        // 效能模式（用户自由切换，降低手机发热）
        lowPowerMode: false,

        // Summarization API (separate from main chat API)
        summarizeUseMainAPI: true,
        summarizeApiEndpoint: '',
        summarizeApiKey: '',
        summarizeModel: 'deepseek-chat',

        // WebLLM 本地推理后端（仅在用户主动选择并确认后才加载）
        inferenceBackend: 'remote-api',
        webllmModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',

        // ComfyUI local txt2img integration
        comfyEnabled: false,
        comfyServer: 'http://127.0.0.1:8188',
        comfyWorkflow: null,
        comfyWorkflowName: '',
        comfyPositiveNodeId: '',
        comfyNegativeNodeId: '',
        comfySeedNodeId: '',
        comfyNegativePrompt: 'low quality, blurry, bad anatomy, bad hands',
        comfyPromptTemplate: 'masterpiece, best quality, anime style, {{char}}, {{scene}}',

        // Cloud Sync stores the same app snapshot used by local persistence.
        cloudSyncEnabled: false,
        cloudSyncAutoUpload: false,
        cloudSyncEndpoint: '/api/sync',
        cloudSyncToken: '',
        cloudSyncEncrypted: false,
        cloudSyncPassphrase: '',
        cloudSyncLastAt: 0,
        cloudSyncLastStatus: ''
    };
}

// ==================== App State ====================
// 注意：当前使用**非响应式**状态管理。
// 直接修改 state.xxx 后，必须手动调用 appStore.notify('xxx') 或对应的 renderXXXOnly() 函数。
var appStore = createReactiveStore({
    settings: defaultSettings(),
    conversations: {},
    conversationOrder: [],
    activeConvId: null,
    worldBooks: {},           // Phase 2+: 全局可复用世界书 { [id]: WorldBook }
    characters: {},           // 全局角色卡库（解决编辑不传播 + 无法删除的问题）
    isGenerating: false,
    abortController: null
});

var state = appStore.state; // 直接暴露普通对象，方便现有代码继续使用 state.xxx = yyy
