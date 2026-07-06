// ==================== WebLLM Cache Tools ====================
async function clearWebLLMCache(options = {}) {
    const { silent = false } = options;
    let cleared = 0;
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            for (const key of keys) {
                if (/webllm|mlc|llm|transformers/i.test(key)) {
                    const ok = await caches.delete(key);
                    if (ok) cleared++;
                }
            }
        }
    } catch (e) { console.warn('[WebLLM] cache clear error', e); }

    if (!silent) {
        const msg = cleared > 0
            ? `已清理 ${cleared} 个 WebLLM 相关 Cache。模型文件可能仍存在于浏览器缓存，请在 DevTools → Application → Storage 清理或“清除站点数据”。`
            : '已尝试清理 WebLLM Cache。模型文件可能仍存于浏览器缓存，请使用“清除站点数据”彻底释放空间。';
        try { alert(msg); } catch(_) {}
    }
    window._webllmCacheSizeMemo = null;
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
}

async function getWebLLMUsedSize(options = {}) {
    const ttl = 60000;
    const now = Date.now();
    const memo = window._webllmCacheSizeMemo;
    if (!options.force && memo && now - memo.time < ttl) return memo.size;

    let total = 0;
    try {
        if (!('caches' in window)) return 0;
        const keys = await caches.keys();
        const relevant = keys.filter(k => /webllm|mlc|llm|transformers/i.test(k));
        for (const name of relevant) {
            try {
                const cache = await caches.open(name);
                const requests = await cache.keys();
                for (const req of requests) {
                    const res = await cache.match(req);
                    if (res) {
                        const blob = await res.blob().catch(() => null);
                        if (blob) total += blob.size;
                    }
                }
            } catch (_) {}
        }
    } catch (e) {}
    window._webllmCacheSizeMemo = { size: total, time: now };
    return total;
}
