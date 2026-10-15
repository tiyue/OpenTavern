/**
 * 新手导读（文件：72-app-init-ui.js）
 *
 * 负责什么：这是“应用启动流程”中的“应用、初始化、界面”部分。
 * 在程序中的位置：它按顺序准备存储、状态、界面和后台任务，最终让页面可交互。
 * 从哪里开始看：主要从 `applyInitialLanguageState(无参数)`、`updateInitialLanguageButtons(lang)`、`showInitialLibraryView(无参数)`、`updateStartupInputAvailability(无参数)`、`migrateActiveConversationFirstMessage(无参数)`、`isAnyStartupModalOpen(无参数)`，以及另外 2 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：启动步骤存在先后依赖，不能在状态加载完成前渲染依赖用户数据的界面。
 */
// ==================== App Init UI ====================
function applyInitialLanguageState() {
    document.documentElement.lang = state.settings.lang;
    updateInitialLanguageButtons(state.settings.lang);
}

function updateInitialLanguageButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        var btnLang = btn.getAttribute('data-lang');
        var active = btnLang === lang;
        btn.classList.toggle('active', active);
        btn.classList.toggle('text-zinc-900', active);
        btn.classList.toggle('text-zinc-400', !active);
    });
}

function showInitialLibraryView() {
    var restored = state._startupRestoredConvId && state.conversations[state._startupRestoredConvId];
    if (state.settings.restoreLastChat && restored && (restored.character || (restored.messages || []).length || (restored.group && (restored.group.members || []).length))) {
        switchView('chat'); return;
    }
    if (typeof initLibraryAsHomepage === 'function') {
        initLibraryAsHomepage();
    }
    if (typeof switchView === 'function') {
        switchView('library');
    }
}

function updateStartupInputAvailability() {
    var missingRemoteApi = !state.settings.apiKey || !state.settings.apiEndpoint;
    if (missingRemoteApi) {
        dom.messageInput.placeholder = t('input_placeholder_no_api');
        dom.messageInput.disabled = true;
        dom.sendBtn.disabled = true;
    } else {
        dom.messageInput.disabled = false;
        dom.sendBtn.disabled = false;
    }
}

async function migrateActiveConversationFirstMessage() {
    var conv = getActiveConv();
    if (!conv || !conv.character || conv.messages.length !== 0 || !conv.character.first_mes) return false;

    var characterSource = JSON.stringify(conv.character);
    try {
        var result = await persistConversationMessageMutation(conv, function(candidate) {
            appendCharacterFirstMessage(candidate, candidate.character);
            return candidate.messages.length > 0;
        }, { validate: function(target) { return JSON.stringify(target.character) === characterSource; } });
        if (!result) return false;
    } catch (error) {
        reportPersistPostSaveError('first message migration', error);
        return false;
    }
    try { renderAll(); } catch (error) { reportPersistPostSaveError('first message migration UI', error); }
    return true;
}

function isAnyStartupModalOpen() {
    return (typeof isOnboardingOpen === 'function' && isOnboardingOpen()) ||
        isModalVisible(dom.announceModal) ||
        isModalVisible(dom.settingsModal) ||
        isModalVisible(dom.importModal) ||
        isModalVisible(dom.charEditorModal) ||
        isModalVisible(dom.summaryManagerModal) ||
        isModalVisible(dom.worldBookModal);
}

function isModalVisible(modal) {
    return !!(modal && !modal.classList.contains('hidden'));
}

function scheduleAnnouncementModal() {
    if (!shouldShowAnnouncement()) {
        scheduleOnboardingModal(680);
        return;
    }
    setTimeout(function() {
        if (!isAnyStartupModalOpen()) {
            showAnnouncementModal();
        }
    }, 680);
}
