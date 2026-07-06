// ==================== Storage Recovery Tools ====================
window.scanAllStorageBackends = scanAllStorageBackends;
window.restoreFromStorageCandidate = restoreFromStorageCandidate;

// ==================== 【Recovery Tool】存储恢复工具（OPFS + IndexedDB + localStorage） ====================

// 原生读取旧版 IndexedDB（OpenTavernDB），仅在用户主动「扫描所有存储后端」时使用。
// 不引入 idb 库，不在启动时自动加载，避免拖慢或引入复杂依赖。
async function readLegacyIndexedDB() {
    return new Promise((resolve) => {
        try {
            // 不指定 version，让它打开最新版本
            const req = indexedDB.open('OpenTavernDB');
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
            req.onsuccess = (ev) => {
                const db = ev.target.result;
                const storeNames = db.objectStoreNames;
                const hasDataStores = storeNames.contains('conversations') || storeNames.contains('metadata');
                if (!hasDataStores) {
                    try { db.close(); } catch (_) {}
                    resolve(null);
                    return;
                }

                try {
                    const tx = db.transaction(Array.from(storeNames), 'readonly');

                    const getP = (storeName, key) => new Promise(r => {
                        try {
                            if (!storeNames.contains(storeName)) { r(null); return; }
                            const g = tx.objectStore(storeName).get(key);
                            g.onsuccess = () => r(g.result);
                            g.onerror = () => r(null);
                        } catch { r(null); }
                    });

                    const getAllP = (storeName) => new Promise(r => {
                        try {
                            if (!storeNames.contains(storeName)) { r([]); return; }
                            const g = tx.objectStore(storeName).getAll();
                            g.onsuccess = () => r(g.result || []);
                            g.onerror = () => r([]);
                        } catch { r([]); }
                    });

                    Promise.all([
                        getP('settings', 'main'),
                        getAllP('conversations'),
                        getAllP('worldBooks'),
                        getP('metadata', 'main')
                    ]).then(([settings, convsRaw, wbsRaw, meta]) => {
                        try { db.close(); } catch (_) {}

                        const conversations = {};
                        (convsRaw || []).forEach(c => { if (c && c.id) conversations[c.id] = c; });

                        const worldBooks = {};
                        (wbsRaw || []).forEach(w => { if (w && w.id) worldBooks[w.id] = w; });

                        const data = {
                            settings: settings || {},
                            conversations,
                            worldBooks,
                            conversationOrder: (meta && meta.conversationOrder) || [],
                            activeConvId: (meta && meta.activeConvId) || null,
                            characters: (meta && meta.characters) || {},
                            charactersMigrated: !!(meta && meta.charactersMigrated),
                            lastSaved: (meta && meta.lastSaved) || Date.now(),
                            _loadedFrom: 'legacy-idb'
                        };
                        resolve(data);
                    }).catch(() => {
                        try { db.close(); } catch (_) {}
                        resolve(null);
                    });
                } catch (_) {
                    try { db.close(); } catch (_) {}
                    resolve(null);
                }
            };
        } catch (_) {
            resolve(null);
        }
    });
}

// 扫描当前可用的后端 + 旧版 IDB（仅用户主动扫描时）
async function scanAllStorageBackends() {
    const candidates = [];

    // OPFS
    try {
        if (typeof OPFSStorage !== 'undefined' && OPFSStorage.loadAll) {
            const data = await OPFSStorage.loadAll();
            if (data && (Object.keys(data.conversations || {}).length > 0 || data.lastSaved)) {
                candidates.push({
                    backend: 'OPFS',
                    data: data,
                    lastSaved: data.lastSaved || 0,
                    convCount: Object.keys(data.conversations || {}).length,
                    charCount: Object.keys(data.characters || {}).length,
                    wbCount: Object.keys(data.worldBooks || {}).length
                });
            }
        }
    } catch (e) { /* ignore */ }

    // IndexedDB 快照后端
    try {
        if (typeof IDBStorage !== 'undefined' && IDBStorage.loadAll) {
            const data = await IDBStorage.loadAll({ fresh: true, retries: 2 });
            if (data && (Object.keys(data.conversations || {}).length > 0 || data.lastSaved || data.settings)) {
                candidates.push({
                    backend: 'IndexedDB 快照',
                    data: data,
                    lastSaved: data.lastSaved || 0,
                    convCount: Object.keys(data.conversations || {}).length,
                    charCount: Object.keys(data.characters || {}).length,
                    wbCount: Object.keys(data.worldBooks || {}).length
                });
            }
        }
    } catch (e) { console.warn('[Recovery] IndexedDB scan failed:', e && e.message); }
    // localStorage 强快照
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && (Object.keys(data.conversations || {}).length > 0 || data.lastSaved || data.settings)) {
                candidates.push({
                    backend: 'localStorage',
                    data: data,
                    lastSaved: data.lastSaved || 0,
                    convCount: Object.keys(data.conversations || {}).length,
                    charCount: Object.keys(data.characters || {}).length,
                    wbCount: Object.keys(data.worldBooks || {}).length
                });
            }
        }
    } catch (e) { /* ignore */ }

    // localStorage 历史备份槽（防止主快照被新版本误覆盖）
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(STORAGE_BACKUP_PREFIX))
            .forEach(k => {
                try {
                    const data = JSON.parse(localStorage.getItem(k));
                    if (data && (Object.keys(data.conversations || {}).length > 0 || Object.keys(data.characters || {}).length > 0 || Object.keys(data.worldBooks || {}).length > 0 || data.settings)) {
                        candidates.push({
                            backend: 'localStorage 历史备份',
                            data: data,
                            lastSaved: data.lastSaved || 0,
                            convCount: Object.keys(data.conversations || {}).length,
                            charCount: Object.keys(data.characters || {}).length,
                            wbCount: Object.keys(data.worldBooks || {}).length
                        });
                    }
                } catch (_) {}
            });
    } catch (e) { /* ignore */ }
    // 旧版 IndexedDB（只在这里尝试，使用原生 API）
    try {
        const legacy = await readLegacyIndexedDB();
        if (legacy && (Object.keys(legacy.conversations || {}).length > 0 || legacy.lastSaved)) {
            candidates.push({
                backend: 'IndexedDB (旧版)',
                data: legacy,
                lastSaved: legacy.lastSaved || 0,
                convCount: Object.keys(legacy.conversations || {}).length,
                charCount: Object.keys(legacy.characters || {}).length,
                wbCount: Object.keys(legacy.worldBooks || {}).length
            });
        }
    } catch (e) { /* ignore */ }

    candidates.forEach(c => {
        c.hasUserData = !!(c.convCount || c.charCount || c.wbCount);
    });
    candidates.sort((a, b) => ((b.hasUserData ? 1 : 0) - (a.hasUserData ? 1 : 0)) || ((b.lastSaved || 0) - (a.lastSaved || 0)));
    return candidates;
}

// 从候选恢复（会覆盖当前 state 并保存到当前后端）
async function restoreFromStorageCandidate(candidate) {
    if (!candidate || !candidate.data) return;

    const data = candidate.data;
    const msg = `确定从「${candidate.backend}」恢复吗？\n\n` +
                `最后保存: ${candidate.lastSaved ? new Date(candidate.lastSaved).toLocaleString() : '未知'}\n` +
                `对话: ${candidate.convCount}  角色卡: ${candidate.charCount}  世界书: ${candidate.wbCount}\n\n` +
                `当前未保存的数据将会丢失，建议先点“Export All”备份！`;

    if (!await showGlassConfirm(msg, { title: '\u6062\u590d\u5b58\u50a8\u6570\u636e', danger: true, okText: '\u6062\u590d' })) return;

    try {
        // 应用数据到 state
        if (data.settings) {
            Object.keys(data.settings).forEach(function(key) {
                state.settings[key] = data.settings[key];
            });
        }
        if (data.conversations) state.conversations = data.conversations;
        if (data.conversationOrder) state.conversationOrder = data.conversationOrder;
        if (data.activeConvId && state.conversations[data.activeConvId]) {
            state.activeConvId = data.activeConvId;
        }
        if (data.worldBooks) state.worldBooks = data.worldBooks;
        if (data.characters) state.characters = data.characters;
        if (typeof data.charactersMigrated !== 'undefined') {
            state._charactersMigrated = !!data.charactersMigrated;
        }

        // 保存到当前主后端
        const dataToSave = {
            settings: getSafeSettingsForPersist(),
            conversations: state.conversations,
            conversationOrder: state.conversationOrder,
            activeConvId: state.activeConvId,
            worldBooks: state.worldBooks || {},
            characters: state.characters || {},
            charactersMigrated: !!state._charactersMigrated,
            lastSaved: Date.now()
        };

        if (typeof StorageService !== 'undefined' && typeof StorageService.saveAll === 'function') {
            await StorageService.saveAll(dataToSave);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        }

        alert(`已从 ${candidate.backend} 恢复成功！页面即将刷新...`);
        location.reload();
    } catch (err) {
        console.error('[Recovery] restore failed:', err);
        alert('恢复失败：' + (err.message || err));
    }
}
