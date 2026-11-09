/**
 * 新手导读（文件：60-library-conversation-actions.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、会话、操作”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `loadOrCreateChatForCharacter(char)`、`loadConversation(id)`、`deleteConversation(id)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Conversation Actions ====================
async function loadOrCreateChatForCharacter(char) {
    if (!char || !char.name) return;

    var recentConv = findMostRecentConversationForCharacter(char.name);

    if (recentConv) {
        await loadConversation(recentConv.id);
        if (!getActiveConv() || getActiveConv().id !== recentConv.id) return;
    } else {
        if (!await newConversation(char)) return;
        currentCharacterName = char.name;
    }

    switchView('chat');
}

async function loadConversation(id) {
    if (state.isGenerating) {
        if (!await showGlassConfirm(t('generation_abort_confirm'), { title: '\u505c\u6b62\u751f\u6210' })) return;
        stopGeneration();
    }
    if (typeof cancelGroupAutoRounds === 'function') cancelGroupAutoRounds();
    var automationPreviousId = state.activeConvId;
    if (automationPreviousId && automationPreviousId !== id && typeof cancelAutomationRuntime === 'function') {
        cancelAutomationRuntime(t('automation_conversation_switched'), automationPreviousId);
    }
    saveCurrentConversation();
    state.activeConvId = id;
    if (typeof syncActiveConversationUserPersona === 'function') syncActiveConversationUserPersona();

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

    if (automationPreviousId !== id && state.conversations[id] && typeof dispatchAutomationEvent === 'function') {
        Promise.resolve(dispatchAutomationEvent('conversation-entered', state.conversations[id], {})).catch(function(error) {
            if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('automation conversation entered event', error);
        });
    }
}

async function deleteConversation(id) {
    if (!await showGlassConfirm(t('delete_confirm'), { title: '\u5220\u9664\u5bf9\u8bdd', danger: true, okText: '\u5220\u9664' })) return;
    if (typeof cancelGroupAutoRounds === 'function' && typeof groupAutoRoundState !== 'undefined' && groupAutoRoundState && groupAutoRoundState.conversationId === id) cancelGroupAutoRounds();
    if (typeof cancelAutomationRuntime === 'function') cancelAutomationRuntime(t('automation_conversation_deleted'), id);
    if (typeof clearSceneFailure === 'function') clearSceneFailure(id);
    deleteConversationFromLibraryState(id);
    persistState();
    requestRender(['conversations', 'conversationOrder', 'activeConvId']);
}
