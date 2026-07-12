/**
 * 新手导读（文件：35-state-persistence-i18n.js）
 *
 * 负责什么：这是“状态持久化”中的“状态、持久化、多语言”部分。
 * 在程序中的位置：它把内存中的应用状态整理成可保存快照，并安排实际写入。
 * 从哪里开始看：主要从 `applyTranslations(无参数)`、`setLanguage(lang)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：要避免高频重复写盘，同时不能漏掉用户刚刚完成的修改。
 */
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
