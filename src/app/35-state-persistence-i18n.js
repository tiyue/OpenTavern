// ==================== Debounced Persist ====================
var _persistTimeout = null;

function persistState(immediate) {
    const dataToSave = {
        settings: getSafeSettingsForPersist(),
        conversations: state.conversations,
        conversationOrder: state.conversationOrder,
        activeConvId: state.activeConvId,
        worldBooks: state.worldBooks || {},   // Phase 2: persist global world books
        characters: state.characters || {},   // 全局角色卡库
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()                  // 用于双后端冲突解决和判断新鲜度（关键）
    };

    // 【Fix Bug 1】立即缓存快照——即使异步写入尚未完成，pagehide handler
    // 也能在页面关闭时将此快照同步刷写到 LS，防止数据丢失
    if (StorageService) {
        StorageService._lastSaveSnapshot = dataToSave;
    }

    const doPersist = async () => {
        try {
            await StorageService.saveAll(dataToSave);
        } catch (e) {
            // Quota 错误已在 StorageService._handleQuotaExceeded 中处理并导出备份
            if (!StorageService._isQuotaError || !StorageService._isQuotaError(e)) {
                console.error('[persistState] Save error:', e);
            }
        } finally {
            // 【Storage Fix】每次持久化后立即刷新存储用量显示
            if (typeof updateStorageInfo === 'function') {
                updateStorageInfo();
            }
            if (typeof scheduleCloudSyncUpload === 'function') {
                scheduleCloudSyncUpload();
            }
        }
    };

    if (immediate) {
        if (_persistTimeout) {
            clearTimeout(_persistTimeout);
            _persistTimeout = null;
        }
        return doPersist();
    }

    if (_persistTimeout) clearTimeout(_persistTimeout);

    _persistTimeout = setTimeout(function() {
        doPersist();
        _persistTimeout = null;
    }, 450);  // 【Storage Fix】轻微加强 debounce
    return Promise.resolve();
}

function getActiveConv() {
    return state.conversations[state.activeConvId];
}

// ==================== Translation DOM Updates ====================
function applyTranslations() {
    // data-i18n — text content
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        var trans = t(key);
        if (trans) el.textContent = trans;
    });
    // data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        var trans = t(key);
        if (trans) el.placeholder = trans;
    });
    // data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-title');
        var trans = t(key);
        if (trans) el.title = trans;
    });
}

function setLanguage(lang) {
    state.settings.lang = lang;
    document.documentElement.lang = lang;
    // Update lang buttons
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        var btnLang = btn.getAttribute('data-lang');
        if (btnLang === lang) {
            btn.classList.add('active');
            btn.classList.add('text-zinc-900');
            btn.classList.remove('text-zinc-400');
        } else {
            btn.classList.remove('active');
            btn.classList.remove('text-zinc-900');
            btn.classList.add('text-zinc-400');
        }
    });
    persistState();
    applyTranslations();
    applyAnnouncementTranslations();   // 如果公告弹窗当前可见，同步更新语言
    updateAnnouncementLangButtons();   // 同步公告栏内的语言按钮高亮状态

    // 语言变更影响范围很大，使用全量渲染
    appStore.notify('settings');
    requestFullRender();
    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}
