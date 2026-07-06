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
