async function initState() {
    // =====================================================
    // 安全启动：优先 StorageService.loadAll()（OPFS 主 + localStorage 快照兜底）
    // 保留 LS 兜底逻辑作为最后防线
    // =====================================================
    let migrationResult = { backend: 'opfs', attempted: false, success: false };

    let saved = null;

    // 主路径：StorageService（OPFS 优先 + LS 强快照兜底）
    try {
        saved = await StorageService.loadAll();
        if (saved) {
            console.log('[Storage] initState: loaded via StorageService, backend=', StorageService.getBackend());
        }
    } catch (e) {
        console.warn('[Storage] StorageService.loadAll error in initState, will try LS compat', e);
    }

    // 最后兜底走兼容的 loadAll（优先读 LS）
    if (!saved) {
        const lsData = loadAll();
        if (lsData) saved = lsData;
    }

    if (saved) {
        if (saved.settings) {
            Object.keys(saved.settings).forEach(function(key) {
                state.settings[key] = saved.settings[key];
            });
        }
        if (saved.conversations) state.conversations = saved.conversations;
        if (saved.conversationOrder) state.conversationOrder = saved.conversationOrder;
        if (saved.activeConvId && state.conversations[saved.activeConvId]) {
            state.activeConvId = saved.activeConvId;
        }
        if (saved.worldBooks) {
            state.worldBooks = saved.worldBooks;
        }
        if (saved.characters) {
            state.characters = saved.characters;
        }
        if (saved.charactersMigrated) {
            state._charactersMigrated = true;
        }
    } else {
        console.log('[Storage] No previous data found, starting fresh');
    }

    // 调试辅助：记录最终加载结果
    console.log('[Storage] Final load state after init:', {
        conversationsCount: Object.keys(state.conversations || {}).length,
        activeConvId: state.activeConvId,
        loadedFrom: saved && saved._loadedFrom,
        migrationResult
    });

    migrationResult.backend = StorageService.getBackend();

    state._storageMigration = migrationResult;

    // Ensure lang is set
    if (!state.settings.lang) state.settings.lang = 'zh-CN';

    // 确保新字段有默认值（旧数据兼容）
    if (typeof state.settings.uiTheme === 'undefined') {
        state.settings.uiTheme = 'new-light';
    }
    if (typeof normalizeUiTheme === 'function') {
        state.settings.uiTheme = normalizeUiTheme(state.settings.uiTheme);
    }
    if (typeof cacheUiTheme === 'function') {
        cacheUiTheme(state.settings.uiTheme);
    }
    if (typeof state.settings.lowPowerMode === 'undefined') {
        state.settings.lowPowerMode = false;
    }
    if (typeof state.settings.ollamaCompatMode !== 'boolean') {
        state.settings.ollamaCompatMode = false;
    }
    if (typeof state.settings.twoStageEnabled !== 'boolean') {
        state.settings.twoStageEnabled = false;
    }
    if (typeof state.settings.twoStageTemperature !== 'number') {
        state.settings.twoStageTemperature = 0.3;
    }
    if (typeof state.settings.twoStageTopP !== 'number') {
        state.settings.twoStageTopP = 0.85;
    }
    if (typeof state.settings.twoStageIncludeRecentContext !== 'boolean') {
        state.settings.twoStageIncludeRecentContext = false;
    }
    if (!state.settings.twoStageSystemPrompt) {
        state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
    }
    if (typeof state.settings.requestCotEnabled !== 'boolean') {
        state.settings.requestCotEnabled = false;
    }
    if (typeof state.settings.showCotEnabled !== 'boolean') {
        state.settings.showCotEnabled = true;
    }
    if (typeof state.settings.postHistoryInstructions !== 'string') {
        state.settings.postHistoryInstructions = '';
    }
    if (typeof state.settings.twoStagePostHistoryInstructions !== 'string') {
        state.settings.twoStagePostHistoryInstructions = '';
    }
    if (typeof state.settings.summaryPrompt !== 'string') {
        state.settings.summaryPrompt = '';
    }

    // 启动时应用已保存的界面主题
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }

    // 启动时应用已保存的效能模式（立即暂停 shader + 应用 CSS 降级）
    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }

    // Security migration for API key persistence
    var hadApiKey = !!(state.settings && state.settings.apiKey);
    if (typeof state.settings.saveApiKey === 'undefined') {
        state.settings.saveApiKey = hadApiKey;
    }
    if (!state.settings.saveApiKey) {
        state.settings.apiKey = '';
        state.settings.summarizeApiKey = '';
    }

    // === 角色卡全局库迁移（解决编辑不生效 + 无法删除问题） ===
    // 只在首次加载时从旧对话迁移（设置 _charactersMigrated 标记后，后续加载尊重用户对 state.characters 的增删，包括删除后不再被旧对话“复活”）
    if (!state.characters) state.characters = {};
    if (!state._charactersMigrated) {
        migrateCharactersToRegistry(state.conversations || {});
        state._charactersMigrated = true;
        // 只有已有真实数据时才立即持久化迁移标记，避免空启动写入覆盖旧数据。
        if (StorageService && StorageService._hasUserData && StorageService._hasUserData(state) && typeof persistState === 'function') persistState(true);
    }

    // === 更健壮的默认对话处理（防止加载好数据后却被重置为默认） ===
    const hasAnyConv = Object.keys(state.conversations || {}).length > 0;

    if (!state.activeConvId || !state.conversations[state.activeConvId]) {
        if (hasAnyConv) {
            // 有对话但 activeConvId 无效 → 尝试恢复第一个（按 conversationOrder 或任意一个）
            const order = Array.isArray(state.conversationOrder) ? state.conversationOrder : [];
            const firstId = order.find(id => state.conversations[id]) || Object.keys(state.conversations)[0];
            if (firstId) {
                state.activeConvId = firstId;
                console.log('[Storage] Recovered activeConvId from existing conversations:', firstId);
            } else {
                state.activeConvId = null;
            }
        }

        // 只有在真正完全没有对话时，才创建全新的默认对话
        if (!state.activeConvId || !state.conversations[state.activeConvId]) {
            console.log('[Storage] No valid conversations found, creating a brand new default one');
            var conv = defaultConversation();
            state.conversations[conv.id] = conv;
            state.conversationOrder.unshift(conv.id);
            state.activeConvId = conv.id;

            // 启动阶段创建的空默认对话不立即落盘，避免覆盖用户已有但暂时未读出的数据。
        }
    }
}
