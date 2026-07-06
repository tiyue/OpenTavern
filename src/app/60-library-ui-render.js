// ==================== Refactored Homepage Card Library ====================
// Default view is the card library with tab switching (My / Public)
// Cards are 3:4 grid. My cards click -> direct to recent chat. Public click -> detail then import.

function switchView(view) {
    currentView = view;
    const libraryV = document.getElementById('libraryView');
    const chatV = document.getElementById('chatView');
    if (!libraryV || !chatV) return;

    const worldBookBlock = document.querySelector('#sidebar .glass.rounded-xl.px-3.py-2');
    const convListEl = document.getElementById('convList');

    if (view === 'library') {
        libraryV.classList.remove('hidden');
        chatV.classList.add('hidden');
        // Full setup for library (grids + tabs)
        if (typeof renderLibrary === 'function') {
            renderLibrary();
        } else {
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
            if (typeof setActiveTab === 'function') setActiveTab(activeLibraryTab || 'my');
        }
        // In library: show all historical conversations on the left
        if (typeof renderConversationList === 'function') renderConversationList();
        if (convListEl) convListEl.style.display = '';
        // Hide character card and world book in library view (per clarification: not in card library page)
        const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
        if (charTitle) {
            const charBlock = charTitle.closest('.glass');
            if (charBlock) charBlock.style.display = 'none';
        }
        const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
        if (worldTitle) {
            const worldBlock = worldTitle.closest('.glass');
            if (worldBlock) worldBlock.style.display = 'none';
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('library-mode');
    } else {
        libraryV.classList.add('hidden');
        chatV.classList.remove('hidden');

        // In chat view: show character card and world book on left (per clarification)
        if (convListEl) convListEl.style.display = '';
        const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
        if (charTitle) {
            const charBlock = charTitle.closest('.glass');
            if (charBlock) charBlock.style.display = '';
        }
        const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
        if (worldTitle) {
            const worldBlock = worldTitle.closest('.glass');
            if (worldBlock) worldBlock.style.display = '';
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('library-mode');

        // GitHub button and language switcher are in the chatTopBar and visible in main interface

        // Force re-render conv list with filter for current character
        if (typeof renderConversationList === 'function') renderConversationList();
    }

    // Update the sidebar close (×) button to act as return-to-library when in chat (mobile)
    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}

function setActiveTab(tab) {
    activeLibraryTab = tab;
    const myGrid = document.getElementById('myCardsGrid');
    const pubGrid = document.getElementById('publicCardsGrid');
    const tabMy = document.getElementById('tabMy');
    const tabPub = document.getElementById('tabPublic');

    if (tab === 'my') {
        if (myGrid) myGrid.classList.remove('hidden');
        if (pubGrid) pubGrid.classList.add('hidden');
        if (tabMy) tabMy.classList.add('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
        if (tabPub) tabPub.classList.remove('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
    } else {
        if (myGrid) myGrid.classList.add('hidden');
        if (pubGrid) pubGrid.classList.remove('hidden');
        if (tabMy) tabMy.classList.remove('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
        if (tabPub) tabPub.classList.add('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
    }
}

function loadOrCreateChatForCharacter(char) {
    if (!char || !char.name) return;

    currentCharacterName = char.name;

    // Find most recent conv for this character
    let recentConv = null;
    let recentTime = 0;
    Object.values(state.conversations || {}).forEach(conv => {
        if (conv.character && conv.character.name === char.name) {
            const t = conv.updated || conv.created || 0;
            if (t > recentTime) {
                recentTime = t;
                recentConv = conv;
            }
        }
    });

    if (recentConv) {
        loadConversation(recentConv.id);
    } else {
        // Create new
        newConversation(char);
    }

    switchView('chat');
}

function renderLibrary() {
    const lib = document.getElementById('libraryView');
    const chat = document.getElementById('chatView');
    if (lib) lib.classList.remove('hidden');
    if (chat) chat.classList.add('hidden');

    // Render grids
    renderLibraryGrids();

    // Tab listeners (bind once)
    const tabMy = document.getElementById('tabMy');
    const tabPub = document.getElementById('tabPublic');
    if (tabMy && !tabMy._wired) {
        tabMy._wired = true;
        tabMy.addEventListener('click', () => {
            setActiveTab('my');
        });
    }
    if (tabPub && !tabPub._wired) {
        tabPub._wired = true;
        tabPub.addEventListener('click', () => {
            setActiveTab('public');
        });
    }

    // Initial tab
    setActiveTab(activeLibraryTab);

    // Note: Create and Import actions are now provided as special cards in the "My Cards" grid (see renderMyCards).
    // This reduces header bloat when selecting cards. No top buttons while browsing the library.

    // Apply initial filter active style for search/filter bar
    document.querySelectorAll('#libraryView [data-filter]').forEach(b => {
        b.classList.remove('bg-amber-500/20', 'text-amber-300');
        if (b.dataset.filter === libraryFilter) {
            b.classList.add('bg-amber-500/20', 'text-amber-300');
        }
    });

    // Sync search input value
    const libSearchSync = document.getElementById('librarySearch');
    if (libSearchSync) libSearchSync.value = librarySearchQuery || '';

    // Hide character card and world book in card library page (left sidebar not needed in library view)
    const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
    if (charTitle) {
        const charBlock = charTitle.closest('.glass');
        if (charBlock) charBlock.style.display = 'none';
    }
    const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
    if (worldTitle) {
        const worldBlock = worldTitle.closest('.glass');
        if (worldBlock) worldBlock.style.display = 'none';
    }
    // Additional selector for world book block
    const worldBlock2 = document.querySelector('#sidebar .glass.rounded-xl.px-3.py-2');
    if (worldBlock2) worldBlock2.style.display = 'none';
}

async function loadConversation(id) {
    if (state.isGenerating) {
        if (!await showGlassConfirm(t('generation_abort_confirm'), { title: '\u505c\u6b62\u751f\u6210' })) return;
        stopGeneration();
    }
    saveCurrentConversation();
    state.activeConvId = id;           // triggers granular renders via subscription

    // 切换对话时清理 @ 指定气泡（只在群聊输入时有意义）
    if (typeof clearPendingGroupMention === 'function') {
        const c = state.conversations[id];
        if (!c || !isGroupChat(c)) clearPendingGroupMention();
    }

    // For chat-only conv list per character
    var c = state.conversations[id];
    if (c && c.character && c.character.name) {
        currentCharacterName = c.character.name;
    } else if (c && isGroupChat(c) && c.group && c.group.members && c.group.members.length > 0) {
        // 群聊：设置到第一个成员的上下文，使群聊出现在对应角色的会话列表中
        currentCharacterName = c.group.members[0].character.name;
    }

    // 切换对话时重置增量渲染状态和“显示全部消息”状态
    var newConv = getActiveConv();
    if (newConv) {
        newConv._showAllMessages = false;
        newConv._lastRenderedVisibleCount = 0;   // 关键：重置增量计数，避免跨对话污染
        newConv._historyWindow = 150;
        newConv._historyScrollHandler = null;
        newConv._wiCache = null;                 // 切换对话时清除世界书缓存
    }

    // 关键修复：load 其它对话时立即清空消息容器，根除旧 DOM 残留
    if (dom.messagesContainer) dom.messagesContainer.innerHTML = '';

    persistState();

    // 显式通知 activeConvId 变更
    requestRender('activeConvId');

    // 确保切换对话时进度条也实时更新
    renderTokenBar();

    // 关键修复：切换到历史对话时，主动用当前阈值检查一次自动总结
    // 解决用户打开旧对话后修改阈值（尤其是调低）却不触发的问题
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
    delete state.conversations[id];
    state.conversationOrder = state.conversationOrder.filter(function(x) { return x !== id; });
    if (state.activeConvId === id) {
        if (state.conversationOrder.length > 0) {
            state.activeConvId = state.conversationOrder[0];
        } else {
            var conv = defaultConversation();
            state.conversations[conv.id] = conv;
            state.conversationOrder.push(conv.id);
            state.activeConvId = conv.id;
        }
    }
    persistState();
    requestRender(['conversations', 'conversationOrder', 'activeConvId']);
}
