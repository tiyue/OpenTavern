// ==================== Phase 4: 备份提醒系统 ====================
const BACKUP_REMINDER_DAYS = 7; // 每7天提醒一次备份

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

// 温和的备份提醒
function showBackupReminderIfNeeded() {
    if (!shouldShowBackupReminder()) return;

    // 只在 LS 兜底时提醒；OPFS 容量较大，交由用量警告接管
    const backend = StorageService.getBackend();
    if (backend === 'idb') {
        // OPFS 也可能 quota 紧张（尤其是手机），让 updateStorageInfo 的警告接管
        return;
    }

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
            // 打开设置或直接触发导出（这里简单打开设置让用户操作）
            const settingsBtn = document.getElementById('sidebarSettingsBtn') || document.getElementById('topSettingsBtn');
            if (settingsBtn) settingsBtn.click();
        };

        document.getElementById('backup-reminder-dismiss').onclick = () => {
            reminder.remove();
            // 推迟几天再提醒
            try {
                localStorage.setItem('opentavern-last-backup', (Date.now() - (BACKUP_REMINDER_DAYS - 2) * 86400000).toString());
            } catch (e) {}
        };
    }, 4500);
}

function getStorageBackendLabel(backend) {
    if (backend === 'opfs') return 'OPFS';
    if (backend === 'idb') return 'IndexedDB';
    if (backend === 'legacy-idb') return '\u65e7\u7248 IndexedDB';
    return 'localStorage';
}

function formatStorageMB(bytes) {
    return ((bytes || 0) / 1024 / 1024).toFixed(1);
}

function getOPFSStatusText(info) {
    if (!info || !info.opfsAvailable) return 'OPFS: \u4e0d\u53ef\u7528';
    if (info.opfsMirrorAvailable) return 'OPFS: \u955c\u50cf\u53ef\u5199';
    if (info.safariOpfsReadOnly) return 'OPFS: Safari \u4ec5\u4f5c\u6062\u590d\u6765\u6e90';
    return 'OPFS: \u4ec5\u4f5c\u6062\u590d\u6765\u6e90';
}

function buildStorageUsageText(info) {
    info = info || {};
    const backendLabel = getStorageBackendLabel(info.backend || StorageService.getBackend());
    const appMB = formatStorageMB(info.used || 0);
    const parts = [`\u5e94\u7528\u5feb\u7167 ${appMB} MB (${backendLabel})`];

    if (info.webllmUsed > 0) {
        parts.push(`\u6a21\u578b\u7f13\u5b58 ${formatStorageMB(info.webllmUsed)} MB`);
    }

    if (info.originUsed > 0 || info.quota > 0) {
        const originMB = formatStorageMB(info.originUsed || ((info.used || 0) + (info.webllmUsed || 0)));
        if (info.quota && info.quota > 0) {
            const quotaGB = (info.quota / 1024 / 1024 / 1024).toFixed(1);
            parts.push(`\u6d4f\u89c8\u5668\u603b\u7528\u91cf ${originMB} MB / \u914d\u989d ~${quotaGB} GB`);
        } else {
            parts.push(`\u6d4f\u89c8\u5668\u603b\u7528\u91cf ${originMB} MB`);
        }
    } else if (info.quota && info.quota > 0) {
        const quotaGB = (info.quota / 1024 / 1024 / 1024).toFixed(1);
        parts.push(`\u914d\u989d ~${quotaGB} GB`);
    }

    if (info.persisted === false) parts.push('\u975e\u6301\u4e45\u6388\u6743');
    parts.push(getOPFSStatusText(info));
    return parts.join(' · ');
}

function getStoragePressurePercent(info) {
    info = info || {};
    const appUsed = info.used || 0;
    const overall = (info.originUsed && info.originUsed > 0)
        ? info.originUsed
        : (appUsed + (info.webllmUsed || 0));
    return (info.quota && info.quota > 0)
        ? Math.min((overall / info.quota) * 100, 100)
        : Math.min(overall / (100 * 1024 * 1024), 100);
}

function styleStorageBackendBadge(el, backend) {
    if (!el) return;
    if (backend === 'idb') {
        el.style.background = 'rgba(59,130,246,0.15)';
        el.style.color = '#60a5fa';
    } else {
        el.style.background = 'rgba(245,158,11,0.15)';
        el.style.color = '#fbbf24';
    }
}

function updateStorageInfo() {
    if (typeof updateStorageStatusUI === 'function') {
        try { updateStorageStatusUI(); } catch (_) {}
    }

    const usageEl = document.getElementById('storageUsage');
    const bar = document.getElementById('storageUsageBar');
    const backendEl = document.getElementById('storageBackend');

    StorageService.getStorageInfo().then(info => {
        const backend = StorageService.getBackend();
        styleStorageBackendBadge(backendEl, backend);

        if (usageEl && info) {
            usageEl.textContent = buildStorageUsageText(info);
            const percent = getStoragePressurePercent(info);
            if (bar) bar.style.width = percent + '%';

            if (percent > 85) {
                if (bar) bar.style.background = '#f87171';
                usageEl.style.color = '#f87171';
            } else if (percent > 75) {
                if (bar) bar.style.background = '#fbbf24';
                usageEl.style.color = '#fbbf24';
            } else {
                if (bar) bar.style.background = '#f59e0b';
                usageEl.style.color = '';
            }
            showOrHideStorageWarning(percent);
        } else if (usageEl) {
            usageEl.textContent = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
            if (bar) bar.style.width = '0%';
        }
    }).catch(() => {});
}
// Storage usage warning UI
let _storageWarningEl = null;
function showOrHideStorageWarning(percent) {
    const THRESHOLD = 75;
    const shouldShow = percent > THRESHOLD;

    if (shouldShow) {
        if (!_storageWarningEl) {
            _storageWarningEl = document.createElement('div');
            _storageWarningEl.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(239,68,68,0.92);color:white;padding:6px 14px;border-radius:999px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;';
            _storageWarningEl.innerHTML = `存储使用率较高 (${percent.toFixed(0)}%)，建议导出备份或清理`;
            document.body.appendChild(_storageWarningEl);

            // 点击可快速打开设置
            _storageWarningEl.onclick = () => {
                const s = document.getElementById('settingsModal');
                if (s) { s.classList.remove('hidden'); }
                if (_storageWarningEl) _storageWarningEl.style.display = 'none';
            };
        } else {
            _storageWarningEl.style.display = 'flex';
            _storageWarningEl.innerHTML = `存储使用率较高 (${percent.toFixed(0)}%)，建议导出备份或清理`;
        }
    } else if (_storageWarningEl) {
        _storageWarningEl.style.display = 'none';
    }
}

// ==================== 极简存储状态 UI 更新 (Phase 1 补充) ====================
function updateStorageStatusUI() {
    const el = document.getElementById('storageStatus');
    if (!el) return;

    const backend = StorageService.getBackend();
    const isIDB = backend === 'idb';
    el.textContent = isIDB ? 'IDB' : 'LS';
    styleStorageBackendBadge(el, backend);

    StorageService.getStorageInfo().then(info => {
        let tip = `\u4e3b\u5b58\u50a8\u540e\u7aef: ${getStorageBackendLabel(info.backend || backend)}`;
        tip += ` · \u5e94\u7528\u5feb\u7167 ${formatStorageMB(info.used || 0)} MB`;
        if (info.webllmUsed > 0) tip += ` · \u6a21\u578b\u7f13\u5b58 ${formatStorageMB(info.webllmUsed)} MB`;
        tip += ` · ${getOPFSStatusText(info)}`;
        if (info.persisted === false) tip += ' · \u975e\u6301\u4e45\u6388\u6743';

        const percent = getStoragePressurePercent(info);
        if (percent > 85) {
            el.style.background = 'rgba(239,68,68,0.25)';
            el.style.color = '#f87171';
            tip += ` (${t('storage_high_warning') || '\u5b58\u50a8\u538b\u529b\u8f83\u9ad8'})`;
        } else if (percent > 75) {
            el.style.background = 'rgba(245,158,11,0.25)';
            el.style.color = '#fbbf24';
        }
        el.title = tip;
    }).catch(() => {
        el.title = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
    });

    if (!el._storageClickBound) {
        el._storageClickBound = true;
        el.addEventListener('click', function() {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.classList.remove('hidden');
        });
    }
}
// WebLLM cache clear helper
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

// 【Storage Fix】计算 WebLLM 相关缓存的实际大小（用于已用空间统计）
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
// 暴露给控制台调试
