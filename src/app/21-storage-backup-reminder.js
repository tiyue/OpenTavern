/**
 * 新手导读（文件：21-storage-backup-reminder.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“存储、备份、提醒”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `shouldShowBackupReminder(无参数)`、`recordBackupMade(无参数)`、`showBackupReminderIfNeeded(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
// ==================== Backup Reminder ====================
const BACKUP_REMINDER_DAYS = 7;

function shouldShowBackupReminder() {
    try {
        const lastBackup = localStorage.getItem('opentavern-last-backup');
        if (!lastBackup) return true;

        const daysSince = (Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24);
        return daysSince > BACKUP_REMINDER_DAYS;
    } catch (e) {
        return true;
    }
}

function recordBackupMade() {
    try {
        localStorage.setItem('opentavern-last-backup', Date.now().toString());
    } catch (e) {}
}

function showBackupReminderIfNeeded() {
    if (!shouldShowBackupReminder()) return;

    const backend = StorageService.getBackend();
    if (backend === 'idb') return;

    setTimeout(() => {
        const reminder = document.createElement('div');
        reminder.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(245,158,11,0.9);color:white;padding:12px 20px;border-radius:12px;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:320px;text-align:center;';
        reminder.innerHTML = `
            ${t('backup_reminder_title')}<br>
            <button id="backup-reminder-btn" style="margin-top:8px;background:white;color:#b45309;border:none;padding:4px 14px;border-radius:6px;font-size:12px;cursor:pointer;">${t('backup_reminder_export_now')}</button>
            <span id="backup-reminder-dismiss" style="margin-left:12px;cursor:pointer;opacity:0.8;">${t('backup_reminder_later')}</span>
        `;
        document.body.appendChild(reminder);

        document.getElementById('backup-reminder-btn').onclick = () => {
            reminder.remove();
            recordBackupMade();
            const settingsBtn = document.getElementById('sidebarSettingsBtn') || document.getElementById('topSettingsBtn');
            if (settingsBtn) settingsBtn.click();
        };

        document.getElementById('backup-reminder-dismiss').onclick = () => {
            reminder.remove();
            try {
                localStorage.setItem('opentavern-last-backup', (Date.now() - (BACKUP_REMINDER_DAYS - 2) * 86400000).toString());
            } catch (e) {}
        };
    }, 4500);
}
