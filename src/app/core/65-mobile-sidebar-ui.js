/**
 * 新手导读（文件：65-mobile-sidebar-ui.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“移动端、侧边栏、界面”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `isMobile(无参数)`、`openSidebar(无参数)`、`closeSidebar(无参数)`、`toggleSidebar(无参数)`、`handleSidebarClose(无参数)`、`updateSidebarCloseButton(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
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
