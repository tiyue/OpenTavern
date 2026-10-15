/**
 * 新手导读（文件：22-cloud-sync-apply-settings.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、应用数据、设置”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `getCloudSyncLocalSettingsForRestore(无参数)`、`preserveCloudSyncEndpointForLocalCredential(target, source, credentialKey, endpointKey)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Apply Local Settings ====================
function getCloudSyncLocalSettingsForRestore() {
    var current = state.settings || {};
    var local = {
        imageGenerationToken: '',
        cloudSyncLastAt: Date.now(),
        cloudSyncLastStatus: '云端下载已应用。'
    };
    Object.assign(local, getCloudSyncPreservedLocalSettings(current));
    preserveCloudSyncEndpointForLocalCredential(local, current, 'apiKey', 'apiEndpoint');
    preserveCloudSyncEndpointForLocalCredential(local, current, 'summarizeApiKey', 'summarizeApiEndpoint');
    return local;
}

function preserveCloudSyncEndpointForLocalCredential(target, source, credentialKey, endpointKey) {
    if (!source || !String(source[credentialKey] || '')) return;
    var endpoint = source[endpointKey];
    if (endpoint === undefined || endpoint === null) return;
    target[endpointKey] = endpoint;
}
