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
    'cardRuntimePermissions',
    'automationRuleGrants',
    'automationSendGrants',
    'automationRecentRuns',
    'scenePackageGrants',
    'sceneRecentRuns',
    'contentModuleGrants',
    'pluginGrants',
    'modelToolGrants'
];

var CLOUD_SYNC_LOCAL_TRANSIENT_SETTING_KEYS = [
    'imageGenerationToken',
    'cloudSyncLastAt',
    'cloudSyncLastStatus'
];

var CLOUD_SYNC_SECRET_SETTING_KEY_PATTERN = /(?:apiKey|token|secret|passphrase|password|credential|privateKey)$/i;

var CLOUD_SYNC_CONNECTION_PROFILE_KEYS = ['id', 'name', 'purpose', 'protocol', 'endpoint', 'model', 'description', 'parameters'];

var CLOUD_SYNC_CONNECTION_PROFILE_PARAMETER_KEYS = [
    'temperature',
    'topP',
    'maxTokens',
    'contextLength',
    'frequencyPenalty',
    'presencePenalty',
    'reasoningEffort',
    'modelContextCapacity',
    'presetId',
    'thinking',
    'useMain',
    'summaryTemperature',
    'summaryPromptMode',
    'summaryReasoningEffort',
    'summaryThinking',
    'embeddingDimensions'
];

var CLOUD_SYNC_NESTED_SECRET_KEY_PATTERN = /(?:apiKey|api_key|token|secret|passphrase|password|credentials?|privateKey|authorization|headers)$/i;

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
    if (Array.isArray(portable.connectionProfiles)) portable.connectionProfiles = getPortableConnectionProfileList(portable.connectionProfiles);
    return portable;
}

// Only the new connection-profile descriptors are whitelisted. Raw preset/character metadata
// keeps its historical shape instead of being recursively stripped by the top-level policy.
function getPortableConnectionProfileList(profiles) {
    if (!Array.isArray(profiles)) return [];
    return profiles.map(sanitizePortableConnectionProfile).filter(function(profile) { return !!profile; });
}

function sanitizePortableConnectionProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    var result = {};
    CLOUD_SYNC_CONNECTION_PROFILE_KEYS.forEach(function(key) {
        if (key === 'parameters') return;
        if (!Object.prototype.hasOwnProperty.call(profile, key)) return;
        var value = profile[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            Object.defineProperty(result, key, { value: value, writable: true, enumerable: true, configurable: true });
        }
    });
    var parameters = profile.parameters;
    if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
        var safeParameters = {};
        CLOUD_SYNC_CONNECTION_PROFILE_PARAMETER_KEYS.forEach(function(key) {
            if (!Object.prototype.hasOwnProperty.call(parameters, key)) return;
            var value = parameters[key];
            if (key === 'thinking' || key === 'summaryThinking') {
                var nested = sanitizePortableNestedObject(value, 0);
                if (nested !== undefined) Object.defineProperty(safeParameters, key, { value: nested, writable: true, enumerable: true, configurable: true });
                return;
            }
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                Object.defineProperty(safeParameters, key, { value: value, writable: true, enumerable: true, configurable: true });
            }
        });
        Object.defineProperty(result, 'parameters', { value: safeParameters, writable: true, enumerable: true, configurable: true });
    }
    return result;
}

function sanitizePortableNestedObject(value, depth) {
    if (depth > 16) return undefined;
    if (Array.isArray(value)) return value.map(function(item) {
        var sanitized = sanitizePortableNestedObject(item, depth + 1);
        return sanitized === undefined ? null : sanitized;
    });
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function(key) {
        if (['__proto__', 'constructor', 'prototype'].indexOf(key) >= 0) return;
        if (CLOUD_SYNC_NESTED_SECRET_KEY_PATTERN.test(String(key || ''))) return;
        var sanitized = sanitizePortableNestedObject(value[key], depth + 1);
        if (sanitized !== undefined) Object.defineProperty(result, key, { value: sanitized, writable: true, enumerable: true, configurable: true });
    });
    return result;
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
