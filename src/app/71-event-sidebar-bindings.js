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

function bindCloudSyncShortcutEvents() {
    document.querySelectorAll('.cloud-sync-shortcut-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (btn.disabled) return;
            var label = btn.getAttribute('data-label') || btn.textContent || '立即同步';
            btn.disabled = true;
            btn.textContent = '同步中...';
            syncCloudSyncSnapshot(dom.cloudSyncStatus).then(function() {
                btn.textContent = '已同步';
            }).catch(function(err) {
                setCloudSyncStatus('云同步失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
                btn.textContent = '同步失败';
            }).finally(function() {
                setTimeout(function() {
                    btn.disabled = false;
                    btn.textContent = label;
                }, 1200);
            });
        });
    });
}
