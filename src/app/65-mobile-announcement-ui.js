// ==================== Mobile Sidebar ====================
function isMobile() {
    return window.innerWidth < 768;
}

function openSidebar() {
    dom.sidebar.classList.add('open');
    dom.sidebarBackdrop.classList.add('open');
}

function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.sidebarBackdrop.classList.remove('open');
}

function toggleSidebar() {
    if (dom.sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

// Repurpose sidebar's "×" (close) button on mobile:
// - In library: just close the drawer (shows full history)
// - In chat: clicking it acts as "return to card library" (and closes)
function handleSidebarClose() {
    if (currentView === 'chat') {
        currentCharacterName = null;
        if (typeof renderConversationList === 'function') renderConversationList();
        if (typeof switchView === 'function') switchView('library');
    }
    closeSidebar();
}

function updateSidebarCloseButton() {
    if (!dom.sidebarCloseBtn) return;
    const inChat = (currentView === 'chat');
    if (inChat) {
        dom.sidebarCloseBtn.innerHTML = '←';
        try {
            var backLabel = (typeof t === 'function' ? t('back_to_library') : '') || '返回卡片库';
            dom.sidebarCloseBtn.setAttribute('aria-label', backLabel);
            dom.sidebarCloseBtn.title = backLabel;
        } catch (e) {
            dom.sidebarCloseBtn.setAttribute('aria-label', '返回卡片库');
            dom.sidebarCloseBtn.title = '返回卡片库';
        }
    } else {
        dom.sidebarCloseBtn.innerHTML = '&times;';
        dom.sidebarCloseBtn.setAttribute('aria-label', 'Close menu');
        dom.sidebarCloseBtn.title = '';
    }
}

// ==================== Announcement Modal (快速开始引导) ====================
var ANNOUNCE_KEY = 'opentavern_announce_dismissed_v1';

function shouldShowAnnouncement() {
    try {
        return localStorage.getItem(ANNOUNCE_KEY) !== '1';
    } catch (e) {
        return true;
    }
}

function showAnnouncementModal() {
    if (!dom.announceModal) return;
    // 每次打开默认不勾选，让用户主动决定是否永久关闭
    if (dom.announceDontShow) dom.announceDontShow.checked = false;
    applyAnnouncementTranslations();   // 应用当前语言
    updateAnnouncementLangButtons();   // 高亮当前语言按钮
    dom.announceModal.classList.remove('hidden');
}

function hideAnnouncementModal() {
    if (!dom.announceModal) return;
    dom.announceModal.classList.add('hidden');
}

function dismissAnnouncement(permanent) {
    if (permanent) {
        try { localStorage.setItem(ANNOUNCE_KEY, '1'); } catch (e) {}
    }
    hideAnnouncementModal();
}

function applyAnnouncementTranslations() {
    if (!dom.announceModal) return;

    dom.announceModal.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        var text = t(key);
        if (text) {
            // Credits contain full lines (label + name). Use textContent for safety.
            el.textContent = text;
        }
    });
}

function updateAnnouncementLangButtons() {
    if (!dom.announceModal) return;
    var currentLang = state.settings.lang || 'zh-CN';

    dom.announceModal.querySelectorAll('.announce-lang-btn').forEach(function(btn) {
        var btnLang = btn.getAttribute('data-lang');
        if (btnLang === currentLang) {
            btn.classList.add('active', 'text-zinc-900');
            btn.classList.remove('text-zinc-400');
        } else {
            btn.classList.remove('active', 'text-zinc-900');
            btn.classList.add('text-zinc-400');
        }
    });
}
