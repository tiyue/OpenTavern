// ==================== OPFS Storage（推荐新后端 - 容量大、可靠性高） ====================
// 使用 Origin Private File System，适合 GitHub Pages / Cloudflare Pages 静态部署
// 数据以单个 JSON 文件形式存储（opentavern-data.json）
const OPFSStorage = {
    _root: null,
    _fileName: 'opentavern-data.json',

    // 【Fix Bug 2】写锁：串行化所有 OPFS 写入，防止并发 createWritable() 冲突
    // 多个 saveAll() 调用会排队依次执行，而非同时争抢同一个文件句柄
    _writeLock: null,

    async _getRoot() {
        if (this._root) return this._root;

        // 【Storage Fix】严格前置检查，避免在 file:// 或非安全上下文下触发 SecurityError
        if (typeof location !== 'undefined' && location.protocol === 'file:') {
            throw new Error('OPFS blocked on file:// protocol (open via http://localhost or deploy to HTTPS)');
        }
        if (!window.isSecureContext) {
            throw new Error('OPFS requires secure context (HTTPS or localhost)');
        }
        if (!navigator.storage || !navigator.storage.getDirectory) {
            throw new Error('OPFS not supported in this browser');
        }

        this._root = await navigator.storage.getDirectory();
        return this._root;
    },
    _probeResult: null,
    _probePromise: null,

    async probeWritable() {
        if (this._probeResult) return this._probeResult;
        if (this._probePromise) return this._probePromise;

        this._probePromise = (async () => {
            const probeName = '__opentavern-opfs-probe__.json';
            const payload = JSON.stringify({ ok: true, t: Date.now() });
            try {
                const root = await this._getRoot();
                const fh = await root.getFileHandle(probeName, { create: true });
                const writable = await fh.createWritable();
                await writable.write(payload);
                await writable.close();

                const file = await fh.getFile();
                const text = await file.text();
                if (text !== payload) throw new Error('OPFS probe verification failed');

                try { await root.removeEntry(probeName); } catch (_) {}
                this._probeResult = { ok: true, reason: null };
                return this._probeResult;
            } catch (e) {
                this._probeResult = {
                    ok: false,
                    reason: e && e.message ? e.message : String(e)
                };
                return this._probeResult;
            } finally {
                this._probePromise = null;
            }
        })();

        return this._probePromise;
    },

    async loadAll() {
        try {
            const root = await this._getRoot();
            let fileHandle;
            try {
                fileHandle = await root.getFileHandle(this._fileName);
            } catch (e) {
                return null; // 文件不存在
            }
            const file = await fileHandle.getFile();
            const text = await file.text();
            if (!text) return null;
            const data = JSON.parse(text);
            // 兼容旧数据
            if (!data.lastSaved) data.lastSaved = Date.now();
            return data;
        } catch (e) {
            // 【Storage Fix】对已知不支持场景（file:// / SecurityError）降低日志噪音
            if (e && (e.name === 'SecurityError' || /file:|unsafe|OPFS (blocked|unavailable)/i.test(e.message||''))) {
                // 静默或只 warn 一次
                if (!OPFSStorage._warnedUnsupported) {
                    console.warn('[OPFS] Not available in current environment (file:// or insecure context). Using fallback storage.');
                    OPFSStorage._warnedUnsupported = true;
                }
            } else {
                console.error('[OPFS] loadAll failed:', e);
            }
            return null;
        }
    },

    // 【Fix Bug 2】公共入口：通过写锁串行化所有写入，防止并发 writable 冲突
    async saveAll(data) {
        const doWrite = () => this._doSaveAll(data);
        // 链式排队：等待上一个写入完成（无论成功或失败），然后执行本次写入
        const prev = this._writeLock || Promise.resolve();
        this._writeLock = prev.then(doWrite, doWrite);
        return this._writeLock;
    },

    // 实际 OPFS 写入逻辑（由写锁串行调用）
    async _doSaveAll(data) {
        try {
            const root = await this._getRoot();
            const fileHandle = await root.getFileHandle(this._fileName, { create: true });
            const writable = await fileHandle.createWritable();
            // 使用紧凑 JSON 节省空间
            await writable.write(JSON.stringify(data));
            await writable.close();
        } catch (e) {
            // 【Storage Fix】对已知不支持场景降低日志噪音
            if (e && (e.name === 'SecurityError' || /file:|unsafe|OPFS (blocked|unavailable)/i.test(e.message||''))) {
                if (!OPFSStorage._warnedUnsupported) {
                    console.warn('[OPFS] Not available in current environment (file:// or insecure context). Using fallback storage.');
                    OPFSStorage._warnedUnsupported = true;
                }
            } else {
                console.error('[OPFS] saveAll failed:', e);
            }
            // 【Storage Fix】让上层统一处理 QuotaExceeded
            throw e;
        }
    },

    async getStorageInfo() {
        // 【Storage Fix】优先返回 OPFS 中实际数据文件大小，而不是整个 origin 的 usage
        try {
            const est = (navigator.storage && navigator.storage.estimate) ? await navigator.storage.estimate() : { usage: 0, quota: null };
            let ourSize = 0;
            try {
                const root = await this._getRoot();
                const fh = await root.getFileHandle(this._fileName);
                const f = await fh.getFile();
                ourSize = f.size || 0;
            } catch (_) { /* 文件不存在时 ourSize=0 */ }
            return {
                backend: 'opfs',
                used: ourSize,          // 真实 OPFS JSON 文件大小（我们的应用数据）
                quota: est.quota,
                originUsed: est.usage   // 供诊断：整个 origin 已用
            };
        } catch (e) {}
        return { backend: 'opfs', used: 0, quota: null };
    },

    async clear() {
        try {
            // 强制新鲜 root，避免缓存的 directory handle 导致删除不彻底
            const root = await navigator.storage.getDirectory();
            try {
                await root.removeEntry(this._fileName);
            } catch (removeErr) {
                // 文件不存在就算清除了；其他错误则尝试覆盖为空数据（确保 load 拿不到旧用户数据）
                if (removeErr && removeErr.name !== 'NotFoundError') {
                    try {
                        const fh = await root.getFileHandle(this._fileName, { create: true });
                        const w = await fh.createWritable();
                        await w.write(JSON.stringify({
                            lastSaved: Date.now(),
                            conversations: {},
                            characters: {},
                            worldBooks: {},
                            conversationOrder: [],
                            activeConvId: null,
                            settings: {}
                        }));
                        await w.close();
                    } catch (_) {}
                }
            }
            this._root = null; // 清理缓存
        } catch (e) {}
    }
};
