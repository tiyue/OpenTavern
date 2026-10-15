/**
 * 新手导读（文件：19-cloud-sync-settings-policy.js）
 *
 * 负责什么：定义哪些设置可以跨设备同步，哪些敏感凭据、设备连接和临时状态只能保留在本机。
 * 在程序中的位置：云同步构建快照、比较变更和应用远端快照时共同使用这里的同一套规则。
 * 修改时注意：普通业务设置默认同步；新增凭据或设备连接字段时必须登记为本机字段。
 */
// ==================== Cloud Sync Settings Policy ====================
var CLOUD_SYNC_LOCAL_PRESERVED_SETTING_KEYS = [
    'apiKey',
    'saveApiKey',
    'summarizeApiKey',
    'imageGenerationEndpoint',
    'cloudSyncEnabled',
    'cloudSyncAutoUpload',
    'cloudSyncEndpoint',
    'cloudSyncToken',
    'cloudSyncEncrypted',
    'cloudSyncPassphrase',
    'cardRuntime',
    'cardRuntimeEnabled',
    'cardRuntimeGrants',
    'cardRuntimePermissions'
];

var CLOUD_SYNC_LOCAL_TRANSIENT_SETTING_KEYS = [
    'imageGenerationToken',
    'cloudSyncLastAt',
    'cloudSyncLastStatus'
];

var CLOUD_SYNC_SECRET_SETTING_KEY_PATTERN = /(?:apiKey|token|secret|passphrase|password|credential|privateKey)$/i;

function isCloudSyncLocalPreservedSettingKey(key) {
    return CLOUD_SYNC_LOCAL_PRESERVED_SETTING_KEYS.indexOf(String(key || '')) >= 0;
}

function isCloudSyncLocalTransientSettingKey(key) {
    return CLOUD_SYNC_LOCAL_TRANSIENT_SETTING_KEYS.indexOf(String(key || '')) >= 0;
}

function isCloudSyncSensitiveSettingKey(key) {
    return CLOUD_SYNC_SECRET_SETTING_KEY_PATTERN.test(String(key || ''));
}

function isCloudSyncLocalOnlySettingKey(key) {
    return ['__proto__', 'constructor', 'prototype'].indexOf(String(key || '')) >= 0 ||
        isCloudSyncLocalPreservedSettingKey(key) ||
        isCloudSyncLocalTransientSettingKey(key) ||
        isCloudSyncSensitiveSettingKey(key);
}

function getCloudSyncPortableSettings(settings) {
    var source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    var portable = JSON.parse(JSON.stringify(source));
    Object.keys(portable).forEach(function(key) {
        if (isCloudSyncLocalOnlySettingKey(key)) delete portable[key];
    });
    return portable;
}

function getCloudSyncPreservedLocalSettings(settings) {
    var source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    var local = {};
    Object.keys(source).forEach(function(key) {
        if (isCloudSyncLocalTransientSettingKey(key)) return;
        if (!isCloudSyncLocalPreservedSettingKey(key) && !isCloudSyncSensitiveSettingKey(key)) return;
        local[key] = source[key];
    });
    return local;
}
