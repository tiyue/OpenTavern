/**
 * 新手导读（文件：65-mobile-announcement-ui.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“移动端、公告、界面”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `shouldShowAnnouncement(无参数)`、`showAnnouncementModal(无参数)`、`hideAnnouncementModal(无参数)`、`dismissAnnouncement(permanent)`、`applyAnnouncementTranslations(无参数)`、`updateAnnouncementLangButtons(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
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
    if (dom.announceAckError) dom.announceAckError.classList.add('hidden');
    applyAnnouncementTranslations();   // 应用当前语言
    updateAnnouncementLangButtons();   // 高亮当前语言按钮
    dom.announceModal.classList.remove('hidden');
}

function canCloseAnnouncement() {
    return !!(dom.announceDontShow && dom.announceDontShow.checked);
}

function tryCloseAnnouncement() {
    if (!canCloseAnnouncement()) {
        if (dom.announceAckError) dom.announceAckError.classList.remove('hidden');
        if (dom.announceDontShow) dom.announceDontShow.focus();
        return false;
    }
    dismissAnnouncement(true);
    if (typeof scheduleOnboardingModal === 'function') scheduleOnboardingModal(180);
    return true;
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
