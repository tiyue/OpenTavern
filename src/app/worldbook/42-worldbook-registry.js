/**
 * 新手导读（文件：42-worldbook-registry.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、注册表”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `updateWIDirtyIndicator(无参数)`、`getActiveWI(无参数)`、`getWorldBook(wbId)`、`createNewWorldBook(name)`、`getConversationWorldBooks(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== Global World Book Registry ====================
var wiState = {
    modalOpen: false,
    currentConvId: null,
    currentWorldBookId: null,
    viewMode: 'books',
    selectedUid: null,
    dirty: false,
    primaryKeys: [],
    secondaryKeys: []
};

function updateWIDirtyIndicator() {
    if (!dom.wiDirtyIndicator) return;
    dom.wiDirtyIndicator.classList.toggle('hidden', !wiState.dirty);
}

function getActiveWI() {
    if (wiState.currentWorldBookId && state.worldBooks && state.worldBooks[wiState.currentWorldBookId]) {
        return state.worldBooks[wiState.currentWorldBookId];
    }
    var conv = getActiveConv();
    return getWorldInfo(conv);
}

function getWorldBook(wbId) {
    if (!wbId) return null;
    if (!state.worldBooks) state.worldBooks = {};
    if (!state.worldBooks[wbId]) {
        state.worldBooks[wbId] = {
            id: wbId,
            name: 'New World Book',
            entries: {},
            created: Date.now()
        };
    }
    return state.worldBooks[wbId];
}

function createNewWorldBook(name) {
    if (!state.worldBooks) state.worldBooks = {};
    const id = 'wb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    state.worldBooks[id] = {
        id: id,
        name: name || 'New World Book',
        entries: {},
        created: Date.now()
    };
    return state.worldBooks[id];
}

function getConversationWorldBooks(conv) {
    if (!conv || !Array.isArray(conv.worldBookIds)) return [];
    return conv.worldBookIds
        .map(function(id) { return state.worldBooks && state.worldBooks[id]; })
        .filter(Boolean);
}
