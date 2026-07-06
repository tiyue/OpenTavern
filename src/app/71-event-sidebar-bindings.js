// ==================== Sidebar and Language Event Bindings ====================
function bindSidebarEvents() {
    dom.hamburgerBtn.addEventListener('click', toggleSidebar);
    if (dom.libraryHamburgerBtn) {
        dom.libraryHamburgerBtn.addEventListener('click', toggleSidebar);
    }
    dom.sidebarCloseBtn.addEventListener('click', handleSidebarClose);
    dom.sidebarBackdrop.addEventListener('click', closeSidebar);
    window.addEventListener('resize', function() {
        if (!isMobile()) closeSidebar();
    });
}

function bindLanguageEvents() {
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setLanguage(this.getAttribute('data-lang'));
        });
    });
}
