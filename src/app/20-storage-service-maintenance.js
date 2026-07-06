// ==================== StorageService Maintenance Helpers ====================
function handleStorageQuotaExceeded(service, err, dataSnapshot) {
    const now = Date.now();
    if (service._lastQuotaAlert && now - service._lastQuotaAlert < 60000) return;
    service._lastQuotaAlert = now;

    try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `opentavern-backup-quota-${ts}.json`;
        const toExport = dataSnapshot || buildStorageQuotaBackupSnapshot();
        if (typeof downloadJsonFile === 'function') {
            downloadJsonFile(toExport, backupName);
        } else {
            downloadStorageQuotaBackupBlob(toExport, backupName);
        }
    } catch (exportErr) {
        console.error('[Storage] Auto backup export on quota fail failed:', exportErr);
    }
    try { alert('Storage quota is full. OpenTavern tried to export a backup. Save the backup file, then clear browser storage space.'); } catch(_) {}
}

function buildStorageQuotaBackupSnapshot() {
    return {
        settings: state ? getSafeSettingsForPersist() : {},
        conversations: state ? state.conversations : {},
        conversationOrder: state ? state.conversationOrder : [],
        activeConvId: state ? state.activeConvId : null,
        worldBooks: state ? (state.worldBooks || {}) : {},
        characters: state ? (state.characters || {}) : {},
        lastSaved: Date.now()
    };
}

function downloadStorageQuotaBackupBlob(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}
