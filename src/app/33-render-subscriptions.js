// ==================== Render Subscriptions ====================
var renderSubscriptions = {
    'conversations': renderConversationList,
    'conversationOrder': renderConversationList,
    'activeConvId': function() {
        renderConversationListOnly();
        renderMessagesOnly();
        renderCharacterUI();
        renderWorldInfoBudgetWarning();
    },
    'isGenerating': function() {
        updateInputState();
    },
    'settings': function() {
        updateInputState();
        renderTopBar();
    },
    'worldInfo': function() {
        renderWorldInfoBudgetWarning();
    }
};

appStore.subscribe(function(changedKeys) {
    changedKeys.forEach(function(key) {
        if (renderSubscriptions[key]) {
            try {
                renderSubscriptions[key]();
            } catch (e) {
                console.error('Render error for key:', key, e);
            }
        }
    });
});
