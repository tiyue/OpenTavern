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
