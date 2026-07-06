// ==================== StorageService Maintenance Helpers ====================
function handleStorageQuotaExceeded(service, err, dataSnapshot) {
    const now = Date.now();
    if (service._lastQuotaAlert && now - service._lastQuotaAlert < 60000) return;
    service._lastQuotaAlert = now;

    try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `opentavern-backup-quota-${ts}.json`;
        const toExport = dataSnapshot || {
            settings: state ? getSafeSettingsForPersist() : {},
            conversations: state ? state.conversations : {},
            conversationOrder: state ? state.conversationOrder : [],
            activeConvId: state ? state.activeConvId : null,
            worldBooks: state ? (state.worldBooks || {}) : {},
            characters: state ? (state.characters || {}) : {},
            lastSaved: Date.now()
        };
        if (typeof downloadJsonFile === 'function') {
            downloadJsonFile(toExport, backupName);
        } else {
            const blob = new Blob([JSON.stringify(toExport, null, 2)], {type:'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = backupName;
            document.body.appendChild(a); a.click(); a.remove();
        }
    } catch (exportErr) {
        console.error('[Storage] Auto backup export on quota fail failed:', exportErr);
    }
    try { alert('Storage quota is full. OpenTavern tried to export a backup. Save the backup file, then clear browser storage space.'); } catch(_) {}
}

async function getStorageServiceInfo(service) {
    try {
        let webllmUsed = 0;
        try {
            if (typeof getWebLLMUsedSize === 'function') webllmUsed = await getWebLLMUsedSize();
        } catch (_) {}

        let appUsed = 0;
        try {
            let current = service._lastSaveSnapshot || null;
            if (!service._isValidSnapshot(current)) {
                const picked = await service._readNewestStoredSnapshotNoSync();
                current = picked && picked.data;
            }
            if (current) appUsed = new Blob([JSON.stringify(current)]).size || 0;
        } catch (_) {}

        let quota = null;
        let originUsed = 0;
        let persisted = null;
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                quota = est.quota || null;
                originUsed = est.usage || 0;
            }
            if (navigator.storage && navigator.storage.persisted) {
                persisted = await navigator.storage.persisted();
            }
        } catch (_) {}

        return {
            backend: service.getBackend(),
            used: appUsed,
            webllmUsed,
            totalUsed: appUsed + webllmUsed,
            originUsed,
            quota,
            persisted,
            idbAvailable: service._idbAvailable || ('indexedDB' in window),
            idbLastError: service._idbFailureReason,
            opfsAvailable: service._opfsReadableAvailable,
            opfsMirrorAvailable: service._opfsMirrorAvailable,
            opfsFailureReason: service._opfsFailureReason,
            safariOpfsReadOnly: service._isSafari() && service._opfsReadableAvailable
        };
    } catch (e) {}
    return { backend: service.getBackend(), used: 0, webllmUsed: 0, totalUsed: 0, originUsed: 0, quota: null, persisted: null };
}

async function clearStorageServiceData(service) {
    let cleared = { opfs: false, idb: false, ls: false };
    const emptyData = {
        lastSaved: Date.now(),
        conversations: {},
        conversationOrder: [],
        activeConvId: null,
        worldBooks: {},
        characters: {},
        settings: {},
        charactersMigrated: true
    };

    try {
        if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.saveAll === 'function' && service._opfsMirrorAvailable && !service._isSafari()) {
            await OPFSStorage.saveAll(emptyData).catch(() => {});
        }
        if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.clear === 'function') {
            try { await OPFSStorage.clear(); } catch (_) {}
        }
        cleared.opfs = true;
    } catch (e) { console.warn('[Storage] OPFS clear/reset error:', e); }

    try {
        if (typeof IDBStorage !== 'undefined' && typeof IDBStorage.clear === 'function') {
            await IDBStorage.clear();
            cleared.idb = true;
        }
    } catch (e) { console.warn('[Storage] IDB clear/reset error:', e); }

    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('opentavern-last-backup');
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('opentavern')) localStorage.removeItem(k);
        });
        try {
            localStorage.setItem(STORAGE_CLEAR_KEY, String(emptyData.lastSaved));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
        } catch (_) {}
        cleared.ls = true;
    } catch (e) {}

    try {
        if ('indexedDB' in window) {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('OpenTavernDB');
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
            });
            cleared.legacyIdb = true;
        }
    } catch (e) { console.warn('[Storage] legacy IDB clear error:', e); }

    try {
        if (typeof clearWebLLMCache === 'function') {
            await clearWebLLMCache({ silent: true });
            cleared.webllm = true;
        }
    } catch (e) {}

    console.log('[Storage] clearAllData result:', cleared);
    if (typeof updateStorageInfo === 'function') setTimeout(() => updateStorageInfo(), 80);
    return cleared;
}
