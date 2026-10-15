/**
 * 新手导读（文件：72-app-init-storage.js）
 *
 * 负责什么：这是“应用启动流程”中的“应用、初始化、存储”部分。
 * 在程序中的位置：它按顺序准备存储、状态、界面和后台任务，最终让页面可交互。
 * 从哪里开始看：主要从 `initializeStorageAndState(无参数)`、`recoverAppStateAfterInitFailure(error)`、`ensureFallbackConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：启动步骤存在先后依赖，不能在状态加载完成前渲染依赖用户数据的界面。
 */
// ==================== App Init Storage ====================
async function initializeStorageAndState() {
    if (StorageService && typeof StorageService.init === 'function') {
        try {
            await StorageService.init();
        } catch (e) {
            console.warn('[init] Storage init error (non-fatal)', e);
        }
    }
    try {
        await initState();
    } catch (e) {
        recoverAppStateAfterInitFailure(e);
    }
}

function recoverAppStateAfterInitFailure(error) {
    console.error('[init] initState failed (will continue with empty state):', error);
    ensureFallbackConversation();
}

function ensureFallbackConversation() {
    if (state.conversations && Object.keys(state.conversations).length > 0) return;

    var def = (typeof defaultConversation === 'function')
        ? defaultConversation()
        : { id: 'c-' + Date.now(), messages: [] };
    state.conversations = state.conversations || {};
    state.conversations[def.id] = def;
    state.activeConvId = def.id;
    state.conversationOrder = [def.id];
}
