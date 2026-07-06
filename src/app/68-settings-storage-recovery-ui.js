function bindSettingsStorageRecoveryControls() {
    const scanBtn = document.getElementById('scanStorageBtn');
    const candidatesDiv = document.getElementById('storageCandidates');
    if (!scanBtn || !candidatesDiv) return;

    scanBtn.onclick = async function() {
        scanBtn.textContent = '\u626b\u63cf\u4e2d...';
        scanBtn.disabled = true;
        candidatesDiv.innerHTML = '';

        try {
            const list = await scanAllStorageBackends();
            if (list.length === 0) {
                candidatesDiv.innerHTML = '<div class="text-[10px] text-zinc-500 px-1">\u672a\u68c0\u6d4b\u5230\u5176\u4ed6\u5b58\u50a8\u540e\u7aef\u7684\u6570\u636e\u3002</div>';
            } else {
                list.forEach(function(candidate) {
                    candidatesDiv.appendChild(createStorageRecoveryCandidateRow(candidate));
                });
            }
        } catch (e) {
            candidatesDiv.innerHTML = '<div class="text-[10px] text-red-400">\u626b\u63cf\u51fa\u9519</div>';
            console.error('[Recovery] scan error', e);
        }

        scanBtn.textContent = '\u91cd\u65b0\u626b\u63cf';
        scanBtn.disabled = false;
    };
}

function createStorageRecoveryCandidateRow(candidate) {
    const row = document.createElement('div');
    row.className = 'glass rounded p-1.5 flex items-center justify-between text-[10px]';
    const timeStr = candidate.lastSaved
        ? new Date(candidate.lastSaved).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})
        : '\u672a\u77e5\u65f6\u95f4';
    row.innerHTML = `
        <div>
            <span class="font-medium text-blue-300">${escapeHtml(candidate.backend)}</span>
            <span class="text-zinc-500 ml-1">${escapeHtml(timeStr)}</span><br>
            <span class="text-zinc-400">${candidate.hasUserData ? '' : '\u7a7a\u5feb\u7167 \u00b7 '}\u5bf9\u8bdd ${candidate.convCount} \u00b7 \u89d2\u8272 ${candidate.charCount} \u00b7 \u4e16\u754c\u4e66 ${candidate.wbCount}</span>
        </div>
    `;

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'ml-2 px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30';
    restoreBtn.textContent = '\u6062\u590d';
    restoreBtn.onclick = function() {
        restoreFromStorageCandidate(candidate);
    };
    row.appendChild(restoreBtn);
    return row;
}
