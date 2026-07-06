// ==================== Initialize ====================
async function init() {
    cacheDom();
    // 【Storage Fix】主动初始化 OPFS（最高优先）。任何存储错误都不应导致整个应用崩溃
    if (StorageService && typeof StorageService.init === 'function') {
        try { await StorageService.init(); } catch (e) { console.warn('[init] Storage init error (non-fatal)', e); }
    }
    try {
        await initState();
    } catch (e) {
        console.error('[init] initState failed (will continue with empty state):', e);
        // 尽量保证至少有基本状态
        if (!state.conversations || Object.keys(state.conversations).length === 0) {
            const def = (typeof defaultConversation === 'function') ? defaultConversation() : { id: 'c-' + Date.now(), messages: [] };
            state.conversations = state.conversations || {};
            state.conversations[def.id] = def;
            state.activeConvId = def.id;
            state.conversationOrder = [def.id];
        }
    }
    bindEvents();

    // Apply initial language
    document.documentElement.lang = state.settings.lang;

    // 修复：初始化时正确清理所有语言按钮的 active 状态，避免硬编码 active 导致显示错乱
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        var btnLang = btn.getAttribute('data-lang');
        if (btnLang === state.settings.lang) {
            btn.classList.add('active', 'text-zinc-900');
            btn.classList.remove('text-zinc-400');
        } else {
            btn.classList.remove('active', 'text-zinc-900');
            btn.classList.add('text-zinc-400');
        }
    });

    applyTranslations();
    renderAll();

    // Homepage is now the card library (per user spec)
    if (typeof initLibraryAsHomepage === 'function') {
        initLibraryAsHomepage();
    }
    if (typeof switchView === 'function') {
        switchView('library');
    }

    var useLocal = isWebLLMBackend();
    if (!useLocal && (!state.settings.apiKey || !state.settings.apiEndpoint)) {
        dom.messageInput.placeholder = t('input_placeholder_no_api');
        dom.messageInput.disabled = true;
        dom.sendBtn.disabled = true;
    } else {
        dom.messageInput.disabled = false;
        dom.sendBtn.disabled = false;
    }

    // Migrate empty active conversation with character's first_mes
    var conv = getActiveConv();
    if (conv && conv.character && conv.messages.length === 0 && conv.character.first_mes) {
        var charName = conv.character.name;
        var userName = state.settings.userName || 'User';
        var firstMes = replacePlaceholders(conv.character.first_mes, charName, userName);
        if (firstMes) {
            conv.messages.push({ role: 'assistant', content: firstMes });
            persistState();
            renderAll();
        }
    }

    // 显示公告引导（除非用户已永久关闭）
    if (shouldShowAnnouncement()) {
        setTimeout(function() {
            // 只有在没有任何其他弹窗打开时才显示，避免冲突
            var hasOtherModalOpen = 
                (dom.settingsModal && !dom.settingsModal.classList.contains('hidden')) ||
                (dom.importModal && !dom.importModal.classList.contains('hidden')) ||
                (dom.charEditorModal && !dom.charEditorModal.classList.contains('hidden')) ||
                (dom.summaryManagerModal && !dom.summaryManagerModal.classList.contains('hidden')) ||
                (dom.worldBookModal && !dom.worldBookModal.classList.contains('hidden'));
            if (!hasOtherModalOpen) {
                showAnnouncementModal();
            }
        }, 680);
    }
}

// 【Storage Fix】调试辅助（可在控制台调用）
window.debugStorage = async () => {
    const info = await StorageService.getStorageInfo();
    console.log('[Storage Debug]', { backend: StorageService.getBackend(), ...info });
    return info;
};
window.clearWebLLMCache = clearWebLLMCache;

// 启动应用（支持异步存储初始化）
init().then(function() {
    // 【Storage Fix】启动后刷新存储显示（侧边栏 + 警告检测）
    if (typeof updateStorageInfo === 'function') {
        updateStorageInfo();
    } else if (typeof updateStorageStatusUI === 'function') {
        updateStorageStatusUI();
    }

    showBackupReminderIfNeeded();

    // 旧的 IndexedDB 迁移提示已移除（不再使用 IDB）
}).catch(function(err) {
    console.error('[App] Initialization failed:', err);
    // 极端降级：确保 DOM 缓存和事件绑定至少能工作
    try {
        cacheDom();
        bindEvents();
        if (typeof updateStorageStatusUI === 'function') {
            updateStorageStatusUI();
        }
    } catch(e) {
        console.error('Fallback initialization failed:', e);
    }
});
