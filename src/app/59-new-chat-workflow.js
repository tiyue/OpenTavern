function archiveCurrentConversation() {
    var conv = getActiveConv();
    if (!conv) return;
    var hasMessages = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMessages) { alert(t('nothing_to_archive')); return; }
    var clone = JSON.parse(JSON.stringify(conv));
    clone.id = makeId();
    clone.title = conv.title + ' ' + t('copy_of');
    clone.created = Date.now();
    clone.updated = Date.now();
    state.conversations[clone.id] = clone;
    state.conversationOrder.unshift(clone.id);
    persistState();
    renderConversationList();
}

function newConversation(charOrChars) {
    saveCurrentConversation();
    var conv = defaultConversation();
    var current = getActiveConv();

    // 复制世界书（如果有）
    if (current && current.worldInfo) {
        conv.worldInfo = JSON.parse(JSON.stringify(current.worldInfo));
    }

    // ===== 单角色模式（原有逻辑） =====
    if (!charOrChars || !Array.isArray(charOrChars)) {
        const character = charOrChars || (current && current.character ? current.character : null);

        if (character) {
            conv.character = JSON.parse(JSON.stringify(character));
            currentCharacterName = character.name;
            const charName = conv.character.name;
            const userName = state.settings.userName || 'User';
            const firstMes = replacePlaceholders(conv.character.first_mes, charName, userName);
            if (firstMes) {
                conv.messages.push({ role: 'assistant', content: firstMes });
            }
            conv.title = t('chat_with') + conv.character.name;
        }
    }
    // ===== 群组模式（Stage 1 MVP） =====
    else if (Array.isArray(charOrChars) && charOrChars.length >= 2) {
        const members = charOrChars.map((char, idx) => ({
            character: JSON.parse(JSON.stringify(char)),
            muted: false,
            order: idx
        }));

        conv.group = {
            id: makeId(),
            name: charOrChars.map(c => c.name).join('、') + ' 的群聊',
            members: members,
            replyStrategy: 'list_order',     // MVP 默认列表顺序
            generationMode: 'switch',        // MVP 默认切换角色卡片
            mergeIncludeMuted: false,
            scenarioOverride: null,
            allowSelfResponse: false,
            autoMode: false
        };

        // 群组第一个角色的开场白（可选）
        const firstChar = members[0].character;
        if (firstChar && firstChar.first_mes) {
            const userName = state.settings.userName || 'User';
            const firstMes = replacePlaceholders(firstChar.first_mes, firstChar.name, userName);
            if (firstMes) {
                conv.messages.push({
                    role: 'assistant',
                    content: firstMes,
                    speaker: firstChar.name
                });
            }
        }

        conv.title = conv.group.name;

        // 设置当前角色上下文为群组第一个成员，便于侧边栏会话列表过滤时能看到该群聊
        if (members.length > 0) {
            currentCharacterName = members[0].character.name;
        }
    }
    // 单角色兜底
    else if (Array.isArray(charOrChars) && charOrChars.length === 1) {
        const character = charOrChars[0];
        conv.character = JSON.parse(JSON.stringify(character));
        currentCharacterName = character.name;
        const charName = conv.character.name;
        const userName = state.settings.userName || 'User';
        const firstMes = replacePlaceholders(conv.character.first_mes, charName, userName);
        if (firstMes) {
            conv.messages.push({ role: 'assistant', content: firstMes });
        }
        conv.title = t('chat_with') + conv.character.name;
    }

    normalizeConversation(conv);

    state.conversations[conv.id] = conv;
    state.conversationOrder.unshift(conv.id);
    state.activeConvId = conv.id;
    if (conv._wiBudgetWarning) conv._wiBudgetWarning = false;
    conv._lastRenderedVisibleCount = 0;
    conv._showAllMessages = false;
    conv._historyWindow = 150;
    conv._historyScrollHandler = null;
    conv._wiCache = null;

    if (dom.messagesContainer) dom.messagesContainer.innerHTML = '';

    persistState();
    requestRender('activeConvId');
    renderTokenBar();

    // 只有群聊才保留 @ 指定气泡，否则清理（新UI）
    if (!(conv && isGroupChat(conv))) {
        if (typeof clearPendingGroupMention === 'function') clearPendingGroupMention();
    }

    // 当从卡片库（library view）通过侧边栏“新对话/新群聊”→角色选择器创建新对话/群聊时，
    // newConversation 负责创建状态，但需要显式切换到聊天界面。
    // loadConversation 和 loadOrCreateChatForCharacter 已经有类似逻辑。
    if (currentView === 'library') {
        switchView('chat');
    }

    if (isMobile()) closeSidebar();
}

// Phase 4: Show character picker when creating new chat
// Stage 1 MVP: 支持多选创建群组聊天
