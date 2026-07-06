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
