/**
 * 新手导读（文件：68-settings-cloud-sync-ui.js）
 *
 * 负责什么：这是“设置界面”中的“设置、云同步、界面”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `hydrateCloudSyncSettingsControls(无参数)`、`applyCloudSyncEncryptionAvailabilityHint(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
function migrateLegacyCloudSyncWebCryptoStatus() {
    if (!state.settings || state.settings.cloudSyncEncrypted === true) return false;
    var status = String(state.settings.cloudSyncLastStatus || '');
    if (status.indexOf('当前页面不支持浏览器加密同步') < 0 &&
        status.indexOf('HTTP/IP 访问通常无法使用 WebCrypto') < 0) {
        return false;
    }
    state.settings.cloudSyncLastStatus = '加密上传已关闭；当前页面可使用未加密的增量同步。请点击“立即同步”或“立即上传”重试。';
    return true;
}

// 云同步设置界面：将当前同步配置回填到设置表单控件。
function hydrateCloudSyncSettingsControls() {
    // 云同步
    ensureCloudSyncSettings();
    var migratedLegacyStatus = migrateLegacyCloudSyncWebCryptoStatus();
    if (dom.cloudSyncEnabled) dom.cloudSyncEnabled.checked = !!state.settings.cloudSyncEnabled;
    if (dom.cloudSyncAutoUpload) dom.cloudSyncAutoUpload.checked = !!state.settings.cloudSyncAutoUpload;
    if (dom.cloudSyncEndpoint) dom.cloudSyncEndpoint.value = state.settings.cloudSyncEndpoint || '/api/sync';
    if (dom.cloudSyncToken) dom.cloudSyncToken.value = state.settings.cloudSyncToken || '';
    if (dom.cloudSyncEncrypted) dom.cloudSyncEncrypted.checked = state.settings.cloudSyncEncrypted === true;
    if (dom.cloudSyncPassphrase) dom.cloudSyncPassphrase.value = state.settings.cloudSyncPassphrase || '';
    if (dom.cloudSyncStatus) {
        var cloudStatus = state.settings.cloudSyncLastStatus || '';
        if (!cloudStatus && state.settings.cloudSyncLastAt) {
            cloudStatus = '上次同步：' + new Date(state.settings.cloudSyncLastAt).toLocaleString();
        }
        dom.cloudSyncStatus.textContent = cloudStatus;
        if (migratedLegacyStatus) dom.cloudSyncStatus.className = 'text-[10px] leading-relaxed text-zinc-500';
    }
    if (migratedLegacyStatus && typeof persistCloudSyncStatusSilently === 'function') {
        persistCloudSyncStatusSilently();
    }
    applyCloudSyncEncryptionAvailabilityHint();
    if (dom.cloudSyncDisableEncryptionBtn) {
        dom.cloudSyncDisableEncryptionBtn.onclick = disableCloudSyncEncryptionFromSettings;
    }
    if (dom.cloudSyncNowBtn) {
        dom.cloudSyncNowBtn.onclick = function() {
            if (typeof commitSettingsCloudConnection === 'function') commitSettingsCloudConnection();
            else readCloudSyncSettingsFromForm();
            syncCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('云同步失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncUploadBtn) {
        dom.cloudSyncUploadBtn.onclick = function() {
            if (typeof commitSettingsCloudConnection === 'function') commitSettingsCloudConnection();
            else readCloudSyncSettingsFromForm();
            uploadCloudSyncSnapshot(dom.cloudSyncStatus, { force: true }).catch(function(err) {
                setCloudSyncStatus('云端上传失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncDownloadBtn) {
        dom.cloudSyncDownloadBtn.onclick = function() {
            if (typeof commitSettingsCloudConnection === 'function') commitSettingsCloudConnection();
            else readCloudSyncSettingsFromForm();
            downloadCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('云端下载失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
}

function applyCloudSyncEncryptionAvailabilityHint() {
    if (!dom.cloudSyncEncrypted) return false;
    var legacyEncryptionEnabled = state.settings.cloudSyncEncrypted === true;
    var unavailableMessage = '增量同步加密尚未实现，即使使用 HTTPS 也不能开启。';
    var legacyMessage = '检测到旧配置仍开启了加密上传。增量同步加密尚未实现，上传会被阻止且不会改为明文；请点击下方“关闭加密上传”，再明确点击“立即同步”或“立即上传”。关闭操作只保存设置，不会自动重试上传。';
    dom.cloudSyncEncrypted.checked = legacyEncryptionEnabled;
    // 状态开关只负责展示，避免误触；遗留 true 通过下方显式按钮关闭。
    dom.cloudSyncEncrypted.disabled = true;
    if (typeof dom.cloudSyncEncrypted.setAttribute === 'function') {
        dom.cloudSyncEncrypted.setAttribute('aria-disabled', 'true');
    }
    var toggle = typeof dom.cloudSyncEncrypted.closest === 'function'
        ? dom.cloudSyncEncrypted.closest('label')
        : null;
    if (toggle) {
        toggle.title = legacyEncryptionEnabled ? legacyMessage : unavailableMessage;
        if (toggle.classList && typeof toggle.classList.toggle === 'function') {
            toggle.classList.toggle('cursor-pointer', false);
            toggle.classList.toggle('cursor-not-allowed', true);
            toggle.classList.toggle('opacity-60', !legacyEncryptionEnabled);
        }
    }
    if (dom.cloudSyncEncryptionNotice) {
        dom.cloudSyncEncryptionNotice.textContent = legacyEncryptionEnabled ? legacyMessage : unavailableMessage + '旧版 v1 加密快照仍可通过下方密码恢复。';
    }
    if (dom.cloudSyncDisableEncryptionBtn) {
        dom.cloudSyncDisableEncryptionBtn.disabled = !legacyEncryptionEnabled;
        if (dom.cloudSyncDisableEncryptionBtn.classList && typeof dom.cloudSyncDisableEncryptionBtn.classList.toggle === 'function') {
            dom.cloudSyncDisableEncryptionBtn.classList.toggle('hidden', !legacyEncryptionEnabled);
        }
        if (typeof dom.cloudSyncDisableEncryptionBtn.setAttribute === 'function') {
            dom.cloudSyncDisableEncryptionBtn.setAttribute('aria-hidden', legacyEncryptionEnabled ? 'false' : 'true');
        }
    }
    return false;
}

async function disableCloudSyncEncryptionFromSettings() {
    if (!state.settings || state.settings.cloudSyncEncrypted !== true) {
        applyCloudSyncEncryptionAvailabilityHint();
        return { success: true, changed: false, uploadStarted: false };
    }
    if (typeof disableCloudSyncEncryptionForFutureUploads !== 'function') {
        var unavailableMessage = '关闭加密上传的设置接口暂不可用；未修改设置，也未上传任何内容。';
        if (typeof setCloudSyncPendingStatus === 'function') {
            setCloudSyncPendingStatus(dom.cloudSyncStatus, unavailableMessage);
        }
        return { success: false, changed: false, uploadStarted: false };
    }
    if (dom.cloudSyncDisableEncryptionBtn) dom.cloudSyncDisableEncryptionBtn.disabled = true;
    try {
        var result = await disableCloudSyncEncryptionForFutureUploads(dom.cloudSyncStatus);
        applyCloudSyncEncryptionAvailabilityHint();
        return result;
    } catch (err) {
        // 事务接口会恢复原始加密值；界面层不重复覆写，避免并发调用破坏仍在执行的事务。
        applyCloudSyncEncryptionAvailabilityHint();
        if (typeof setCloudSyncPendingStatus === 'function') {
            setCloudSyncPendingStatus(dom.cloudSyncStatus, '关闭加密上传失败：' + ((err && err.message) || err));
        }
        return { success: false, changed: false, uploadStarted: false, error: err };
    } finally {
        if (dom.cloudSyncDisableEncryptionBtn) {
            dom.cloudSyncDisableEncryptionBtn.disabled = state.settings.cloudSyncEncrypted !== true;
        }
    }
}
