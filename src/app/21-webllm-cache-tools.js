/**
 * 新手导读（文件：21-webllm-cache-tools.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“浏览器本地大模型、缓存、工具”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `clearWebLLMCache(options = {})`、`getWebLLMUsedSize(options = {})` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
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
