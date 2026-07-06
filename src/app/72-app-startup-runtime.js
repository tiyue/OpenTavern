// ==================== App Startup Runtime ====================
function installAppDebugGlobals() {
    window.debugStorage = async function() {
        var info = await StorageService.getStorageInfo();
        console.log('[Storage Debug]', { backend: StorageService.getBackend(), ...info });
        return info;
    };
    window.clearWebLLMCache = clearWebLLMCache;
}

function refreshStartupStorageStatus() {
    if (typeof updateStorageInfo === 'function') {
        updateStorageInfo();
    } else if (typeof updateStorageStatusUI === 'function') {
        updateStorageStatusUI();
    }
}

function runFallbackInitialization(err) {
    console.error('[App] Initialization failed:', err);
    try {
        cacheDom();
        bindEvents();
        if (typeof updateStorageStatusUI === 'function') {
            updateStorageStatusUI();
        }
    } catch (e) {
        console.error('Fallback initialization failed:', e);
    }
}

function startApp() {
    init().then(function() {
        refreshStartupStorageStatus();
        showBackupReminderIfNeeded();
    }).catch(runFallbackInitialization);
}
