/**
 * 新手导读：在主应用启动前，尽早恢复用户上次选择的界面主题。
 *
 * 执行顺序是：先从 localStorage 读取主题名称；只接受代码认识的三个值；
 * 然后把对应 class 加到 body 上。这样浏览器第一次绘制页面时就能使用正确主题，
 * 避免先显示默认颜色、随后突然变色的“闪屏”。
 *
 * try/catch 是必要的：隐私模式或浏览器策略可能禁止 localStorage。读取失败时使用
 * new-light 默认主题即可，不能让主题问题阻止整个聊天应用启动。
 */
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
