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
// 云同步设置界面：将当前同步配置回填到设置表单控件。
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
