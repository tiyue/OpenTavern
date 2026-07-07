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
                const hasDataStores = legacyIDBHasStore(storeNames, 'conversations') || legacyIDBHasStore(storeNames, 'metadata');
                if (!hasDataStores) {
                    closeLegacyIndexedDB(db);
                    resolve(null);
                    return;
                }

                try {
                    const tx = db.transaction(Array.from(storeNames), 'readonly');

                    Promise.all([
                        getLegacyIDBStoreValue(tx, storeNames, 'settings', 'main'),
                        getAllLegacyIDBStoreValues(tx, storeNames, 'conversations'),
                        getAllLegacyIDBStoreValues(tx, storeNames, 'worldBooks'),
                        getLegacyIDBStoreValue(tx, storeNames, 'metadata', 'main')
                    ]).then(([settings, convsRaw, wbsRaw, meta]) => {
                        closeLegacyIndexedDB(db);
                        resolve(buildLegacyIDBRecoverySnapshot(settings, convsRaw, wbsRaw, meta));
                    }).catch(() => {
                        closeLegacyIndexedDB(db);
                        resolve(null);
                    });
                } catch (_) {
                    closeLegacyIndexedDB(db);
                    resolve(null);
                }
            };
        } catch (_) {
            resolve(null);
        }
    });
}
