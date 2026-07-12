/**
 * 新手导读（文件：34-state-init-load.js）
 *
 * 负责什么：这是“应用状态初始化”中的“状态、初始化、读取”部分。
 * 在程序中的位置：它读取保存的数据、修复旧格式，并保证至少有一个可用会话。
 * 从哪里开始看：主要从 `loadInitialStateSnapshot(无参数)`、`applySavedStateSnapshot(saved)`、`logInitialStateLoadResult(saved, migrationResult)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化发生在界面可用之前，异常必须转成安全默认状态而不是中断启动。
 */
// ==================== State Initialization Load Helpers ====================
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
    if (isSavedStateObjectMap(saved.conversations)) {
        state.conversations = saved.conversations;
    }
    if (saved.conversationOrder || saved.conversations) {
        state.conversationOrder = normalizeSavedStateConversationOrder(saved.conversationOrder, state.conversations);
    }
    if (typeof saved.activeConvId === 'string' && state.conversations[saved.activeConvId]) {
        state.activeConvId = saved.activeConvId;
    }
    if (isSavedStateObjectMap(saved.worldBooks)) state.worldBooks = saved.worldBooks;
    if (isSavedStateObjectMap(saved.characters)) state.characters = saved.characters;
    if (typeof saved.charactersMigrated !== 'undefined') {
        state._charactersMigrated = normalizeSavedStateBoolean(saved.charactersMigrated);
    }
}

function logInitialStateLoadResult(saved, migrationResult) {
    console.log('[Storage] Final load state after init:', {
        conversationsCount: Object.keys(state.conversations || {}).length,
        activeConvId: state.activeConvId,
        loadedFrom: saved && saved._loadedFrom,
        migrationResult
    });
}
