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

function applyUiTheme(theme) {
    var value = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(theme) : (theme || 'new-light');
    if (typeof cacheUiTheme === 'function') cacheUiTheme(value);
    if (!document.body) return;
    document.body.classList.remove('theme-new-light', 'theme-new-dark');
    if (value !== 'classic') {
        document.body.classList.add('theme-' + value);
        try { if (typeof window.__pauseShader === 'function') window.__pauseShader(); } catch (e) {}
    } else if (!document.body.classList.contains('low-power')) {
        try { if (typeof window.__resumeShader === 'function') window.__resumeShader(); } catch (e) {}
    }
}
