function hydrateCloudSyncSettingsControls() {
    // 云同步
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) dom.cloudSyncEnabled.checked = !!state.settings.cloudSyncEnabled;
    if (dom.cloudSyncAutoUpload) dom.cloudSyncAutoUpload.checked = !!state.settings.cloudSyncAutoUpload;
    if (dom.cloudSyncEndpoint) dom.cloudSyncEndpoint.value = state.settings.cloudSyncEndpoint || '/api/sync';
    if (dom.cloudSyncToken) dom.cloudSyncToken.value = state.settings.cloudSyncToken || '';
    if (dom.cloudSyncEncrypted) dom.cloudSyncEncrypted.checked = !!state.settings.cloudSyncEncrypted;
    if (dom.cloudSyncPassphrase) dom.cloudSyncPassphrase.value = state.settings.cloudSyncPassphrase || '';
    if (dom.cloudSyncStatus) {
        var cloudStatus = state.settings.cloudSyncLastStatus || '';
        if (!cloudStatus && state.settings.cloudSyncLastAt) {
            cloudStatus = '上次同步：' + new Date(state.settings.cloudSyncLastAt).toLocaleString();
        }
        dom.cloudSyncStatus.textContent = cloudStatus;
    }
    applyCloudSyncEncryptionAvailabilityHint();
    if (dom.cloudSyncNowBtn) {
        dom.cloudSyncNowBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            syncCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('云同步失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncUploadBtn) {
        dom.cloudSyncUploadBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            uploadCloudSyncSnapshot(dom.cloudSyncStatus, { force: true }).catch(function(err) {
                setCloudSyncStatus('云端上传失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncDownloadBtn) {
        dom.cloudSyncDownloadBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            downloadCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('云端下载失败：' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
}

function applyCloudSyncEncryptionAvailabilityHint() {
    if (
        !dom.cloudSyncEncrypted ||
        typeof isCloudSyncWebCryptoAvailable !== 'function' ||
        isCloudSyncWebCryptoAvailable()
    ) return true;
    dom.cloudSyncEncrypted.checked = false;
    dom.cloudSyncEncrypted.disabled = true;
    if (state.settings) state.settings.cloudSyncEncrypted = false;
    var toggle = dom.cloudSyncEncrypted.closest('label');
    if (toggle) {
        toggle.classList.add('opacity-50', 'cursor-not-allowed');
        toggle.title = typeof getCloudSyncWebCryptoUnavailableMessage === 'function'
            ? getCloudSyncWebCryptoUnavailableMessage()
            : '当前页面不支持浏览器加密同步。';
    }
    if (dom.cloudSyncPassphrase) dom.cloudSyncPassphrase.disabled = true;
    if (dom.cloudSyncStatus && typeof setCloudSyncPendingStatus === 'function') {
        setCloudSyncPendingStatus(dom.cloudSyncStatus, '当前 HTTP 页面不支持浏览器加密同步，已关闭“加密上传内容”。如需加密，请使用 HTTPS 域名访问。');
    }
    return false;
}
