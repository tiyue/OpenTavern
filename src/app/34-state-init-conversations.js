/**
 * 新手导读（文件：34-state-init-conversations.js）
 *
 * 负责什么：这是“应用状态初始化”中的“状态、初始化、多个会话”部分。
 * 在程序中的位置：它读取保存的数据、修复旧格式，并保证至少有一个可用会话。
 * 从哪里开始看：主要从 `migrateCharacterRegistryOnStartup(无参数)`、`ensureActiveConversationOnStartup(无参数)`、`recoverActiveConversationFromExistingData(无参数)`、`createStartupDefaultConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化发生在界面可用之前，异常必须转成安全默认状态而不是中断启动。
 */
// ==================== State Initialization Conversation Helpers ====================
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
    var firstId = getFirstAvailableConversationId(state.conversationOrder, state.conversations);
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
