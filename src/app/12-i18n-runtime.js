// ==================== i18n Runtime Helpers ====================
function t(key) {
    var lang = state.settings.lang || 'zh-CN';
    var dict = i18n[lang];
    if (!dict) dict = i18n['en'];
    return dict[key] !== undefined ? dict[key] : (i18n['en'][key] || key);
}
