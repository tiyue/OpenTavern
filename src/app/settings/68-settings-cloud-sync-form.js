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
function readCloudSyncSettingsFromForm(target) {
    var settings = target || (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings);
    if (settings === state.settings) ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) settings.cloudSyncEnabled = readCheckboxControlValue(dom.cloudSyncEnabled, false);
    if (dom.cloudSyncAutoUpload) settings.cloudSyncAutoUpload = readCheckboxControlValue(dom.cloudSyncAutoUpload, false);
    if (dom.cloudSyncEndpoint) settings.cloudSyncEndpoint = readTrimmedControlValueOr(dom.cloudSyncEndpoint, '/api/sync');
    if (dom.cloudSyncToken) settings.cloudSyncToken = readTrimmedControlValue(dom.cloudSyncToken);
    if (settings === state.settings && dom.cloudSyncEncrypted) {
        var wasEncrypted = settings.cloudSyncEncrypted === true;
        var encrypted = readCheckboxControlValue(dom.cloudSyncEncrypted, false);
        // 此复选框只展示接口状态，不负责修改。false 不能被开启，遗留 true 也不会因保存表单而静默关闭。
        // 遗留状态只能通过设置页的“关闭加密上传”按钮显式修改；该接口只保存设置，不会自动上传。
        if (encrypted !== wasEncrypted) {
            dom.cloudSyncEncrypted.checked = wasEncrypted;
            if (typeof setCloudSyncPendingStatus === 'function') {
                setCloudSyncPendingStatus(dom.cloudSyncStatus, wasEncrypted
                    ? '请使用“关闭加密上传”按钮明确关闭；未修改设置，也未上传任何内容。'
                    : '增量同步加密尚未实现，当前不能开启；未修改设置，也未上传任何内容。');
            }
        }
        settings.cloudSyncEncrypted = wasEncrypted;
        dom.cloudSyncEncrypted.disabled = true;
        if (typeof applyCloudSyncEncryptionAvailabilityHint === 'function') {
            applyCloudSyncEncryptionAvailabilityHint();
        }
    }
    if (dom.cloudSyncPassphrase) settings.cloudSyncPassphrase = readControlValue(dom.cloudSyncPassphrase);
}
