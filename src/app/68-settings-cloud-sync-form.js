/**
 * 新手导读（文件：68-settings-cloud-sync-form.js）
 *
 * 负责什么：这是“设置界面”中的“设置、云同步、表单”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `readCloudSyncSettingsFromForm(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 云同步设置表单：读取并规范化端点、令牌、加密与自动上传选项。
function readCloudSyncSettingsFromForm() {
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = readCheckboxControlValue(dom.cloudSyncEnabled, false);
    if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = readCheckboxControlValue(dom.cloudSyncAutoUpload, false);
    if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = readTrimmedControlValueOr(dom.cloudSyncEndpoint, '/api/sync');
    if (dom.cloudSyncToken) state.settings.cloudSyncToken = readTrimmedControlValue(dom.cloudSyncToken);
    if (dom.cloudSyncEncrypted) {
        var encrypted = readCheckboxControlValue(dom.cloudSyncEncrypted, false);
        if (encrypted && typeof isCloudSyncWebCryptoAvailable === 'function' && !isCloudSyncWebCryptoAvailable()) {
            encrypted = false;
            dom.cloudSyncEncrypted.checked = false;
            if (typeof setCloudSyncPendingStatus === 'function') {
                setCloudSyncPendingStatus(dom.cloudSyncStatus, '当前 HTTP 页面不支持浏览器加密同步，已关闭“加密上传内容”。本次将按普通云同步上传。');
            }
        }
        state.settings.cloudSyncEncrypted = encrypted;
    }
    if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = readControlValue(dom.cloudSyncPassphrase);
}
