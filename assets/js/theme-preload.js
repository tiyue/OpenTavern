(function() {
    var key = 'opentavern-ui-theme';
    var theme = 'new-light';
    try {
        var cached = localStorage.getItem(key);
        if (cached === 'new-light' || cached === 'new-dark' || cached === 'classic') {
            theme = cached;
        }
    } catch (_) {}
    if (theme === 'new-light' || theme === 'new-dark') {
        document.body.classList.remove('theme-new-light', 'theme-new-dark');
        document.body.classList.add('theme-' + theme);
    } else {
        document.body.classList.remove('theme-new-light', 'theme-new-dark');
    }
})();
