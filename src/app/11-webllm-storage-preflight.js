// ==================== WebLLM Storage Preflight ====================
async function preflightWebLLMStorageQuota(info) {
    try {
        const needMB = info.sizeMB || 900;
        const sInfo = await StorageService.getStorageInfo();
        if (sInfo && sInfo.quota != null) {
            const currentUsed = (sInfo.originUsed && sInfo.originUsed > 0)
                ? sInfo.originUsed
                : ((sInfo.totalUsed != null) ? sInfo.totalUsed : (sInfo.used || 0));
            const freeEst = sInfo.quota - currentUsed;
            if (freeEst < needMB * 1024 * 1024 * 1.6) {
                const ok = await showGlassConfirm(`\u5b58\u50a8\u7a7a\u95f4\u53ef\u80fd\u4e0d\u8db3\uff08\u6a21\u578b\u7ea6 ${needMB}MB\uff09\u3002\u5efa\u8bae\u5148\u6e05\u7406 WebLLM \u7f13\u5b58\u6216\u5bfc\u51fa\u5907\u4efd\u518d\u7ee7\u7eed\u3002\n\u4ecd\u8981\u7ee7\u7eed\u5417\uff1f`, { title: '\u5b58\u50a8\u7a7a\u95f4\u63d0\u9192' });
                if (!ok) {
                    if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
                    if (typeof persistState === 'function') await persistState(true);
                    return false;
                }
            }
        }
    } catch (_) {}
    return true;
}
