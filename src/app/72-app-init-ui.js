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
    if (typeof initLibraryAsHomepage === 'function') {
        initLibraryAsHomepage();
    }
    if (typeof switchView === 'function') {
        switchView('library');
    }
}

function updateStartupInputAvailability() {
    var useLocal = isWebLLMBackend();
    var missingRemoteApi = !state.settings.apiKey || !state.settings.apiEndpoint;
    if (!useLocal && missingRemoteApi) {
        dom.messageInput.placeholder = t('input_placeholder_no_api');
        dom.messageInput.disabled = true;
        dom.sendBtn.disabled = true;
    } else {
        dom.messageInput.disabled = false;
        dom.sendBtn.disabled = false;
    }
}

function migrateActiveConversationFirstMessage() {
    var conv = getActiveConv();
    if (!conv || !conv.character || conv.messages.length !== 0 || !conv.character.first_mes) return false;

    var charName = conv.character.name;
    var userName = state.settings.userName || 'User';
    var firstMes = replacePlaceholders(conv.character.first_mes, charName, userName);
    if (!firstMes) return false;

    conv.messages.push({ role: 'assistant', content: firstMes });
    persistState();
    renderAll();
    return true;
}

function isAnyStartupModalOpen() {
    return isModalVisible(dom.settingsModal) ||
        isModalVisible(dom.importModal) ||
        isModalVisible(dom.charEditorModal) ||
        isModalVisible(dom.summaryManagerModal) ||
        isModalVisible(dom.worldBookModal);
}

function isModalVisible(modal) {
    return !!(modal && !modal.classList.contains('hidden'));
}

function scheduleAnnouncementModal() {
    if (!shouldShowAnnouncement()) return;
    setTimeout(function() {
        if (!isAnyStartupModalOpen()) {
            showAnnouncementModal();
        }
    }, 680);
}
