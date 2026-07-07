// ==================== StorageService Maintenance Helpers ====================
function handleStorageQuotaExceeded(service, err, dataSnapshot) {
    const now = Date.now();
    if (service._lastQuotaAlert && now - service._lastQuotaAlert < 60000) return;
    service._lastQuotaAlert = now;

    try {
        const backupName = buildStorageQuotaBackupName();
        const toExport = dataSnapshot || buildStorageQuotaBackupSnapshot();
        exportStorageQuotaBackup(toExport, backupName);
    } catch (exportErr) {
        console.error('[Storage] Auto backup export on quota fail failed:', exportErr);
    }
    try { alert('Storage quota is full. OpenTavern tried to export a backup. Save the backup file, then clear browser storage space.'); } catch(_) {}
}
