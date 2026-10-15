/**
 * 新手导读（文件：71-event-sidebar-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、侧边栏、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindSidebarEvents(无参数)`、`bindLanguageEvents(无参数)`、`bindCloudSyncShortcutEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
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
