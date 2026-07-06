function bindSettingsStorageControls() {
    const backendEl = document.getElementById('storageBackend');
    const usageRow = document.getElementById('storageUsageRow');
    const usageEl = document.getElementById('storageUsage');

    const backend = StorageService.getBackend();

    if (backendEl) {
        backendEl.textContent = t('storage_backend') + ' (' + getStorageBackendLabel(backend) + ')';
        styleStorageBackendBadge(backendEl, backend);
    }

    if (usageEl) {
        StorageService.getStorageInfo().then(function(info) {
            const bar = document.getElementById('storageUsageBar');
            if (info) {
                usageEl.textContent = buildStorageUsageText(info);
                const percent = getStoragePressurePercent(info);
                if (bar) bar.style.width = percent + '%';
                if (percent > 85) {
                    if (bar) bar.style.background = '#f87171';
                    usageEl.style.color = '#f87171';
                } else if (percent > 70) {
                    if (bar) bar.style.background = '#fbbf24';
                    usageEl.style.color = '#fbbf24';
                } else {
                    if (bar) bar.style.background = '#f59e0b';
                    usageEl.style.color = '';
                }
            } else {
                usageEl.textContent = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
                if (bar) bar.style.width = '0%';
            }
        }).catch(function() {
            usageEl.textContent = '\u65e0\u6cd5\u8bfb\u53d6\u5b58\u50a8\u7528\u91cf';
            const bar = document.getElementById('storageUsageBar');
            if (bar) bar.style.width = '0%';
        });
    }

    const hintEl = document.getElementById('storageHint');
    if (hintEl) {
        StorageService.getStorageInfo().then(function(info) {
            const canonical = getStorageBackendLabel((info && info.backend) || backend);
            const opfs = getOPFSStatusText(info || {});
            hintEl.textContent = `\u4e3b\u5b58\u50a8\u4f7f\u7528 ${canonical}\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167\uff0c${opfs}\u3002`;
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        }).catch(function() {
            hintEl.textContent = backend === 'idb'
                ? 'IndexedDB \u4e3b\u5b58\u50a8\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167\u3002'
                : 'localStorage \u5e94\u6025\u5feb\u7167\u6b63\u5728\u4f7f\u7528\uff0c\u5efa\u8bae\u5b9a\u671f\u5bfc\u51fa\u5907\u4efd\u3002';
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        });
    }

    updateStorageStatusUI();

    const clearBtn = document.getElementById('clearOPFSBtn');
    if (clearBtn) {
        clearBtn.style.display = 'flex';
        clearBtn.textContent = t('clear_opfs_data') || '清除所有用户数据（OPFS + LS 快照）';
        if (backend === 'idb') {
            clearBtn.style.background = 'rgba(239,68,68,0.15)';
            clearBtn.style.color = '';
        } else {
            clearBtn.style.background = 'rgba(245,158,11,0.15)';
            clearBtn.style.color = '#fbbf24';
        }

        clearBtn.onclick = async function() {
            if (!await showGlassConfirm('\u786e\u5b9a\u8981\u6c38\u4e45\u5220\u9664\u6240\u6709\u7528\u6237\u6570\u636e\u5417\uff1f\n\u5305\u62ec\u89d2\u8272\u5361\u3001\u5bf9\u8bdd\u3001\u4e16\u754c\u4e66\u3001WebLLM \u6a21\u578b\u7f13\u5b58\u7b49\u3002\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff0c\u9875\u9762\u5c06\u91cd\u65b0\u52a0\u8f7d\u3002', { title: '\u6e05\u9664\u6240\u6709\u7528\u6237\u6570\u636e', danger: true, okText: '\u6c38\u4e45\u5220\u9664' })) {
                return;
            }

            try {
                if (typeof StorageService !== 'undefined' && typeof StorageService.clearAllData === 'function') {
                    await StorageService.clearAllData();
                } else {
                    if (typeof OPFSStorage !== 'undefined' && OPFSStorage.clear) await OPFSStorage.clear();
                    try {
                        localStorage.removeItem(STORAGE_KEY);
                        localStorage.removeItem('opentavern-last-backup');
                        Object.keys(localStorage).forEach(k => { if (k.startsWith('opentavern')) localStorage.removeItem(k); });
                        // 兜底写空
                        const empty = JSON.stringify({lastSaved: Date.now(), conversations: {}, characters: {}, worldBooks: {}});
                        localStorage.setItem(STORAGE_KEY, empty);
                    } catch (e) {}
                }

                // 立即在 UI 上反馈已清空（reload 前）
                try {
                    if (typeof updateStorageInfo === 'function') updateStorageInfo();
                    const usageEl = document.getElementById('storageUsage');
                    const bar = document.getElementById('storageUsageBar');
                    if (usageEl) usageEl.textContent = '0.0 MB / ~0 GB (已清除)';
                    if (bar) bar.style.width = '0%';
                } catch (_) {}

                alert('所有用户数据已清除。页面即将重新加载...');
                location.reload();
            } catch (err) {
                console.error('[Storage] 清除所有数据失败:', err);
                alert('清除失败：' + (err.message || err));
            }
        };
    }

    // 【Storage Fix】绑定清除 WebLLM 缓存按钮
    const clearWebLLMBtn = document.getElementById('clearWebLLMBtn');
    if (clearWebLLMBtn) {
        clearWebLLMBtn.onclick = async function() {
            if (!await showGlassConfirm('\u786e\u5b9a\u8981\u6e05\u9664 WebLLM \u4e0b\u8f7d\u7684\u6a21\u578b\u7f13\u5b58\u5417\uff1f\n\u8fd9\u4f1a\u91ca\u653e\u5927\u91cf\u7a7a\u95f4\uff0c\u4f46\u4e0b\u6b21\u4f7f\u7528\u672c\u5730\u6a21\u578b\u65f6\u9700\u8981\u91cd\u65b0\u4e0b\u8f7d\u3002', { title: '\u6e05\u9664 WebLLM \u6a21\u578b\u7f13\u5b58', okText: '\u6e05\u9664' })) return;
            if (typeof clearWebLLMCache === 'function') {
                await clearWebLLMCache();
            }
        };
    }

    // 【Recovery Tool】绑定扫描和恢复
    const scanBtn = document.getElementById('scanStorageBtn');
    const candidatesDiv = document.getElementById('storageCandidates');
    if (scanBtn && candidatesDiv) {
        scanBtn.onclick = async function() {
            const originalText = scanBtn.textContent;
            scanBtn.textContent = '扫描中...';
            scanBtn.disabled = true;
            candidatesDiv.innerHTML = '';

            try {
                const list = await scanAllStorageBackends();
                if (list.length === 0) {
                    candidatesDiv.innerHTML = '<div class="text-[10px] text-zinc-500 px-1">未检测到其他存储后端的数据。</div>';
                } else {
                    list.forEach(function(cand) {
                        const row = document.createElement('div');
                        row.className = 'glass rounded p-1.5 flex items-center justify-between text-[10px]';
                        const timeStr = cand.lastSaved ? new Date(cand.lastSaved).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '未知时间';
                        row.innerHTML = `
                            <div>
                                <span class="font-medium text-blue-300">${cand.backend}</span>
                                <span class="text-zinc-500 ml-1">${timeStr}</span><br>
                                <span class="text-zinc-400">${cand.hasUserData ? '' : '空快照 · '}对话 ${cand.convCount} · 角色 ${cand.charCount} · 世界书 ${cand.wbCount}</span>
                            </div>
                        `;
                        const restoreBtn = document.createElement('button');
                        restoreBtn.className = 'ml-2 px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30';
                        restoreBtn.textContent = '恢复';
                        restoreBtn.onclick = function() {
                            restoreFromStorageCandidate(cand);
                        };
                        row.appendChild(restoreBtn);
                        candidatesDiv.appendChild(row);
                    });
                }
            } catch (e) {
                candidatesDiv.innerHTML = '<div class="text-[10px] text-red-400">扫描出错</div>';
                console.error('[Recovery] scan error', e);
            }

            scanBtn.textContent = '重新扫描';
            scanBtn.disabled = false;
        };
    }
}
