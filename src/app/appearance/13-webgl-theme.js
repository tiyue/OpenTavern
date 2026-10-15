/**
 * 新手导读（文件：13-webgl-theme.js）
 *
 * 负责什么：这是“WebGL 动态背景”中的“WebGL 背景、主题”部分。
 * 在程序中的位置：它初始化绘图程序，并根据窗口大小和主题持续刷新背景。
 * 从哪里开始看：主要从 `applyPerformanceMode(enabled)`、`applyUiTheme(theme)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：着色器代码运行在 GPU 上；语法错误可能只表现为背景消失。
 */
// ==================== Theme and Performance Mode ====================
function applyPerformanceMode(enabled) {
    var isLow = !!enabled;
    if (document.body) {
        document.body.classList.toggle('low-power', isLow);
    }
    try {
        if (isLow) {
            if (typeof window.__pauseShader === 'function') window.__pauseShader();
        } else if (!document.body || (!document.body.classList.contains('theme-new-light') && !document.body.classList.contains('theme-new-dark'))) {
            if (typeof window.__resumeShader === 'function') window.__resumeShader();
        }
    } catch (e) {
        // Shader controls may not be ready during early startup.
    }
}

var uiThemeSystemQuery;
function applyUiTheme(theme, options) {
    var value = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(theme) : (theme || 'new-light');
    if ((!options || options.cache !== false) && typeof cacheUiTheme === 'function') cacheUiTheme(value);
    if (!document.body) return;
    if (!uiThemeSystemQuery && window.matchMedia) {
        uiThemeSystemQuery = window.matchMedia('(prefers-color-scheme: dark)');
        uiThemeSystemQuery.addEventListener('change', function() {
            if (document.body.dataset.uiThemePreference === 'system') applyUiTheme('system', { cache: false });
        });
    }
    document.body.dataset.uiThemePreference = value;
    document.body.classList.remove('theme-new-light', 'theme-new-dark', 'theme-taoxin');
    var resolved = value === 'system' ? (uiThemeSystemQuery && uiThemeSystemQuery.matches ? 'new-dark' : 'new-light') : value === 'taoxin' ? 'new-light' : value;
    if (resolved !== 'classic') {
        document.body.classList.add('theme-' + resolved);
        if (value === 'taoxin') document.body.classList.add('theme-taoxin');
        try { if (typeof window.__pauseShader === 'function') window.__pauseShader(); } catch (e) {}
    } else if (!document.body.classList.contains('low-power')) {
        try { if (typeof window.__resumeShader === 'function') window.__resumeShader(); } catch (e) {}
    }
}
