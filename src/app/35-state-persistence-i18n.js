// ==================== Translation DOM Updates ====================
function applyTranslations() {
    // data-i18n — text content
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        var trans = t(key);
        if (trans) el.textContent = trans;
    });
    // data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        var trans = t(key);
        if (trans) el.placeholder = trans;
    });
    // data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-title');
        var trans = t(key);
        if (trans) el.title = trans;
    });
}

function setLanguage(lang) {
    state.settings.lang = lang;
    document.documentElement.lang = lang;
    // Update lang buttons
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        var btnLang = btn.getAttribute('data-lang');
        if (btnLang === lang) {
            btn.classList.add('active');
            btn.classList.add('text-zinc-900');
            btn.classList.remove('text-zinc-400');
        } else {
            btn.classList.remove('active');
            btn.classList.remove('text-zinc-900');
            btn.classList.add('text-zinc-400');
        }
    });
    persistState();
    applyTranslations();
    applyAnnouncementTranslations();   // 如果公告弹窗当前可见，同步更新语言
    updateAnnouncementLangButtons();   // 同步公告栏内的语言按钮高亮状态

    // 语言变更影响范围很大，使用全量渲染
    appStore.notify('settings');
    requestFullRender();
    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}
