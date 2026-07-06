// ==================== Legacy IndexedDB Recovery Reader ====================
async function readLegacyIndexedDB() {
    return new Promise((resolve) => {
        try {
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

                        resolve({
                            settings: settings || {},
                            conversations,
                            worldBooks,
                            conversationOrder: (meta && meta.conversationOrder) || [],
                            activeConvId: (meta && meta.activeConvId) || null,
                            characters: (meta && meta.characters) || {},
                            charactersMigrated: !!(meta && meta.charactersMigrated),
                            lastSaved: (meta && meta.lastSaved) || Date.now(),
                            _loadedFrom: 'legacy-idb'
                        });
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
