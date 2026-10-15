/**
 * 新手导读（文件：30-state-api-conversation.js）
 *
 * 负责什么：这是“应用状态核心”中的“状态、模型接口、会话”部分。
 * 在程序中的位置：它定义全局状态、默认设置以及会话增删改查入口。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：状态字段会被持久化；新增字段时要同时考虑默认值和旧快照规范化。
 */
// ==================== App State ====================
var appStore = createReactiveStore({
    settings: defaultSettings(),
    conversations: {},
    conversationOrder: [],
    activeConvId: null,
    worldBooks: {},
    characters: {},
    isGenerating: false,
    abortController: null
});

var state = appStore.state;
