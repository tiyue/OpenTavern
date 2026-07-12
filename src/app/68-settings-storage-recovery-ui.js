/**
 * 新手导读（文件：68-settings-storage-recovery-ui.js）
 *
 * 负责什么：这是“设置界面”中的“设置、存储、恢复、界面”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `bindSettingsStorageRecoveryControls(无参数)`、`createStorageRecoveryCandidateRow(candidate)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 存储恢复设置：绑定扫描后端、预览候选快照和恢复操作。
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
