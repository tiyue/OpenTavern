// ==================== Announcement and Hotkey Event Bindings ====================
function bindAnnouncementEvents() {
    if (dom.announceCloseBtn) {
        dom.announceCloseBtn.addEventListener('click', function() {
            hideAnnouncementModal();
        });
    }
    if (dom.announceBackdrop) {
        dom.announceBackdrop.addEventListener('click', function() {
            hideAnnouncementModal();
        });
    }
    if (dom.announceGotItBtn) {
        dom.announceGotItBtn.addEventListener('click', function() {
            var dontShow = !!(dom.announceDontShow && dom.announceDontShow.checked);
            dismissAnnouncement(dontShow);
        });
    }

    document.querySelectorAll('.announce-lang-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var lang = this.getAttribute('data-lang');
            if (lang) setLanguage(lang);
        });
    });
}

function bindGlobalKeyboardEvents() {
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;

        if (isMobile() && dom.sidebar.classList.contains('open')) {
            closeSidebar();
            return;
        }
        if (!dom.settingsModal.classList.contains('hidden')) closeSettings();
        if (!dom.charEditorModal.classList.contains('hidden')) dom.charEditorModal.classList.add('hidden');
        if (!dom.importModal.classList.contains('hidden')) dom.importModal.classList.add('hidden');
        if (!dom.promptViewerModal.classList.contains('hidden')) dom.promptViewerModal.classList.add('hidden');
        if (dom.summarizeModal && !dom.summarizeModal.classList.contains('hidden')) dom.summarizeModal.classList.add('hidden');
        if (dom.summaryHistoryModal && !dom.summaryHistoryModal.classList.contains('hidden')) dom.summaryHistoryModal.classList.add('hidden');
        if (dom.summaryManagerModal && !dom.summaryManagerModal.classList.contains('hidden')) dom.summaryManagerModal.classList.add('hidden');
        if (!dom.worldBookModal.classList.contains('hidden')) closeWorldBookModal();
        if (!dom.announceModal.classList.contains('hidden')) hideAnnouncementModal();
    });
}
