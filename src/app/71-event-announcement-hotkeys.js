/**
 * 新手导读（文件：71-event-announcement-hotkeys.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、公告、快捷键”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindAnnouncementEvents(无参数)`、`bindGlobalKeyboardEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
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

        if (typeof isImageGenerationPanelOpen === 'function' && isImageGenerationPanelOpen()) {
            if (imageGenerationIsGenerating) cancelImageGenerationRequest();
            else closeImageGenerationPanel();
            return;
        }

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
