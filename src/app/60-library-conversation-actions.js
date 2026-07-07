// ==================== Library Conversation Actions ====================
function loadOrCreateChatForCharacter(char) {
    if (!char || !char.name) return;

    currentCharacterName = char.name;
    var recentConv = findMostRecentConversationForCharacter(char.name);

    if (recentConv) {
        loadConversation(recentConv.id);
    } else {
        newConversation(char);
    }

    switchView('chat');
}

async function loadConversation(id) {
    if (state.isGenerating) {
        if (!await showGlassConfirm(t('generation_abort_confirm'), { title: '\u505c\u6b62\u751f\u6210' })) return;
        stopGeneration();
    }
    saveCurrentConversation();
    state.activeConvId = id;

    if (typeof clearPendingGroupMention === 'function') {
        const c = state.conversations[id];
        if (!c || !isGroupChat(c)) clearPendingGroupMention();
    }

    var displayName = getConversationDisplayCharacterName(state.conversations[id]);
    if (displayName) currentCharacterName = displayName;

    resetConversationRuntimeState(getActiveConv());

    if (dom.messagesContainer) dom.messagesContainer.innerHTML = '';

    persistState();
    requestRender('activeConvId');
    renderTokenBar();

    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 650);
    }

    if (currentView === 'library') {
        switchView('chat');
    }

    if (isMobile()) closeSidebar();
}

async function deleteConversation(id) {
    if (!await showGlassConfirm(t('delete_confirm'), { title: '\u5220\u9664\u5bf9\u8bdd', danger: true, okText: '\u5220\u9664' })) return;
    deleteConversationFromLibraryState(id);
    persistState();
    requestRender(['conversations', 'conversationOrder', 'activeConvId']);
}
