/**
 * 新手导读（文件：32-plugin-packages.js）
 *
 * 负责什么：通用插件包格式、严格校验、内容摘要、能力/依赖声明、本机授权指纹、
 * 插件私有数据规范化和可靠保存事务。
 * 在程序中的位置：安装定义与私有数据存放在 settings；本机授权单独存放且不进入云同步/备份。
 * 从哪里开始看：`normalizePluginPackage(raw)`、`savePluginSettingsChange(mutator)`、
 * `pluginFingerprint(record)`、`pluginPrivateDataExport(pluginId)`。
 * 修改时注意：导入、云同步和备份恢复都不能授予执行许可；内容摘要必须由宿主重新计算，
 * 不能信任包内自报的 digest。
 */
// ==================== Plugin Packages ====================
var PLUGIN_PACKAGE_TYPE = 'opentavern-plugin';
var PLUGIN_FORMAT_VERSION = 1;
var PLUGIN_SCHEMA_VERSION = 1;
var PLUGIN_MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
var PLUGIN_MAX_ENTRY_BYTES = 512 * 1024;
var PLUGIN_MAX_RESOURCES = 16;
var PLUGIN_MAX_RESOURCE_BYTES = 128 * 1024;
var PLUGIN_MAX_TOTAL_RESOURCE_BYTES = 512 * 1024;
var PLUGIN_MAX_PLUGINS = 16;
var PLUGIN_MAX_DEPENDENCIES = 8;
var PLUGIN_MAX_CAPABILITIES = 8;
var PLUGIN_MAX_NETWORK_ORIGINS = 4;
var PLUGIN_MAX_NETWORK_METHODS = 5;
var PLUGIN_MAX_NAME = 80;
var PLUGIN_MAX_SOURCE = 200;
var PLUGIN_MAX_DESCRIPTION = 1000;
var PLUGIN_MAX_PRIVATE_KEYS = 64;
var PLUGIN_MAX_PRIVATE_DEPTH = 6;
var PLUGIN_MAX_PRIVATE_BYTES = 64 * 1024;
var PLUGIN_MAX_PRIVATE_ARRAY = 100;
var PLUGIN_MAX_UI_TITLE = 120;
var PLUGIN_MAX_UI_TEXT = 4000;
var PLUGIN_MAX_UI_ACTIONS = 4;
var PLUGIN_MAX_NETWORK_BODY = 64 * 1024;
var PLUGIN_MAX_NETWORK_RESPONSE = 256 * 1024;
var PLUGIN_MAX_RPC_BYTES = 64 * 1024;
var PLUGIN_MAX_RPC_RESPONSE_BYTES = 256 * 1024;
var PLUGIN_STARTUP_TIMEOUT_MS = 8000;
var PLUGIN_PROBE_STABILITY_MS = 1500;
var PLUGIN_NETWORK_TIMEOUT_MS = 10000;
var PLUGIN_HEARTBEAT_MS = 2000;
var PLUGIN_STALE_MS = 6000;
var PLUGIN_RATE_WINDOW_MS = 10000;
var PLUGIN_MAX_RPC_PER_WINDOW = 60;
var PLUGIN_MAX_INFLIGHT_RPC = 8;
var PLUGIN_MAX_QUEUED_MESSAGES = 32;
var PLUGIN_MAX_QUEUED_BYTES = 256 * 1024;
var PLUGIN_MAX_MESSAGES_PER_WINDOW = 120;
var PLUGIN_MAX_CALL_IDS = 512;
var PLUGIN_MAX_STATS_MESSAGES = 300;
var PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
var PLUGIN_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
var PLUGIN_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
var PLUGIN_RESOURCE_PATH_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var PLUGIN_PRIVATE_KEY_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
var PLUGIN_ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;
var PLUGIN_RESERVED_IDS = ['__proto__', 'prototype', 'constructor'];
var PLUGIN_CAPABILITIES = ['conversation.stats', 'events.conversation', 'network.rpc', 'storage.private', 'ui.panel'];
var PLUGIN_NETWORK_METHODS = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'];
var PLUGIN_PACKAGE_KEYS = ['type', 'formatVersion', 'manifest', 'entry', 'resources', 'digest'];
var PLUGIN_MANIFEST_KEYS = ['id', 'name', 'version', 'schemaVersion', 'source', 'description', 'capabilities', 'dependencies', 'network'];
var PLUGIN_RESOURCE_KEYS = ['path', 'text'];
var PLUGIN_RECORD_KEYS = [
    'id', 'name', 'version', 'schemaVersion', 'source', 'description',
    'capabilities', 'dependencies', 'network', 'digest', 'entry', 'resources',
    'installedAt', 'updatedAt', 'previous'
];
var PLUGIN_PREVIOUS_KEYS = [
    'id', 'name', 'version', 'schemaVersion', 'source', 'description', 'capabilities', 'dependencies',
    'network', 'digest', 'entry', 'resources', 'savedAt'
];
var PLUGIN_GRANT_KEYS = ['fingerprint', 'version', 'digest', 'capabilities', 'network', 'grantedAt'];
var failedPluginDraft = null;

function pluginPlainRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pluginOnlyKeys(value, keys) {
    if (!pluginPlainRecord(value)) return false;
    return Object.keys(value).every(function(key) { return keys.indexOf(key) >= 0; });
}

function pluginBoundedText(value, limit, allowEmpty) {
    return typeof value === 'string' && value.length <= limit && (allowEmpty === true || value.trim() !== '');
}

function pluginTextBytes(value) {
    var text = String(value == null ? '' : value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return text.length;
}

function pluginVersionValid(value) {
    return typeof value === 'string' && PLUGIN_VERSION_PATTERN.test(value);
}

function pluginIdValid(value) {
    return typeof value === 'string' && PLUGIN_ID_PATTERN.test(value) && PLUGIN_RESERVED_IDS.indexOf(value) < 0;
}

function pluginCanonical(value) {
    return JSON.stringify(value, function(_key, current) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        var sorted = Object.create(null);
        Object.keys(current).sort().forEach(function(key) {
            if (PLUGIN_RESERVED_IDS.indexOf(key) < 0) sorted[key] = current[key];
        });
        return sorted;
    });
}

function pluginSha256Hex(input) {
    var sha = typeof window !== 'undefined' && window && typeof window.sha256 === 'function' ? window.sha256 : null;
    if (!sha) throw new Error(t('plugin_crypto_unavailable'));
    return sha(input);
}

function pluginFormatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KiB';
    return (value / (1024 * 1024)).toFixed(2) + ' MiB';
}

function pluginManifestFromRecord(record) {
    return {
        id: record.id,
        name: record.name,
        version: record.version,
        schemaVersion: record.schemaVersion,
        source: record.source,
        description: record.description || '',
        capabilities: (record.capabilities || []).slice(),
        dependencies: (record.dependencies || []).map(function(dependency) {
            return { id: dependency.id, version: dependency.version };
        }),
        network: (record.network || []).map(function(rule) {
            return { origin: rule.origin, methods: rule.methods.slice() };
        })
    };
}

function pluginPackagePayload(record) {
    return {
        type: PLUGIN_PACKAGE_TYPE,
        formatVersion: PLUGIN_FORMAT_VERSION,
        manifest: pluginManifestFromRecord(record),
        entry: { code: record.entry && record.entry.code || '' },
        resources: (record.resources || []).map(function(resource) {
            return { path: resource.path, text: resource.text };
        })
    };
}

function pluginComputeDigest(record) {
    return 'sha256:' + pluginSha256Hex(pluginCanonical(pluginPackagePayload(record)));
}

function pluginFingerprint(record) {
    return 'sha256:' + pluginSha256Hex(pluginCanonical({
        id: record.id,
        version: record.version,
        schemaVersion: record.schemaVersion,
        source: record.source,
        digest: record.digest,
        capabilities: (record.capabilities || []).slice().sort(),
        network: (record.network || []).map(function(rule) {
            return { origin: rule.origin, methods: rule.methods.slice().sort() };
        }).sort(function(left, right) { return left.origin < right.origin ? -1 : left.origin > right.origin ? 1 : 0; })
    }));
}

function pluginNetworkRuleKey(rule) {
    return String(rule && rule.origin || '') + ' ' + (rule && rule.methods || []).slice().sort().join(',');
}

function pluginSanitizeNetwork(raw, invalid) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > PLUGIN_MAX_NETWORK_ORIGINS) { invalid.value = true; return []; }
    var seen = Object.create(null);
    var rules = [];
    raw.forEach(function(rule) {
        if (!pluginPlainRecord(rule) || !pluginOnlyKeys(rule, ['origin', 'methods']) ||
            typeof rule.origin !== 'string' || !Array.isArray(rule.methods) ||
            !rule.methods.length || rule.methods.length > PLUGIN_MAX_NETWORK_METHODS) {
            invalid.value = true;
            return;
        }
        var parsed;
        try { parsed = new URL(rule.origin); } catch (error) { invalid.value = true; return; }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
            (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
            invalid.value = true;
            return;
        }
        var methods = [];
        rule.methods.forEach(function(method) {
            if (typeof method !== 'string' || PLUGIN_NETWORK_METHODS.indexOf(method.toUpperCase()) < 0 || methods.indexOf(method.toUpperCase()) >= 0) {
                invalid.value = true;
                return;
            }
            methods.push(method.toUpperCase());
        });
        var origin = parsed.origin;
        if (!methods.length || seen[origin]) { invalid.value = true; return; }
        seen[origin] = true;
        rules.push({ origin: origin, methods: methods.sort() });
    });
    return rules.sort(function(left, right) { return left.origin < right.origin ? -1 : left.origin > right.origin ? 1 : 0; });
}

function pluginSanitizeManifest(raw, invalid) {
    if (!pluginPlainRecord(raw) || !pluginOnlyKeys(raw, PLUGIN_MANIFEST_KEYS)) { invalid.value = true; return null; }
    if (!pluginIdValid(raw.id) || !pluginBoundedText(raw.name, PLUGIN_MAX_NAME) ||
        !pluginVersionValid(raw.version) || Number(raw.schemaVersion) !== PLUGIN_SCHEMA_VERSION ||
        !pluginBoundedText(raw.source, PLUGIN_MAX_SOURCE) ||
        (raw.description !== undefined && !pluginBoundedText(raw.description, PLUGIN_MAX_DESCRIPTION, true))) {
        invalid.value = true;
        return null;
    }
    if (!Array.isArray(raw.capabilities) || raw.capabilities.length > PLUGIN_MAX_CAPABILITIES) { invalid.value = true; return null; }
    var capabilities = [];
    raw.capabilities.forEach(function(capability) {
        if (typeof capability !== 'string' || PLUGIN_CAPABILITIES.indexOf(capability) < 0 || capabilities.indexOf(capability) >= 0) {
            invalid.value = true;
            return;
        }
        capabilities.push(capability);
    });
    if (!Array.isArray(raw.dependencies) || raw.dependencies.length > PLUGIN_MAX_DEPENDENCIES) { invalid.value = true; return null; }
    var dependencies = [], dependencyIds = Object.create(null);
    raw.dependencies.forEach(function(dependency) {
        if (!pluginPlainRecord(dependency) || !pluginOnlyKeys(dependency, ['id', 'version']) ||
            !pluginIdValid(dependency.id) || !pluginVersionValid(dependency.version) ||
            dependency.id === raw.id || dependencyIds[dependency.id] || dependencies.length >= PLUGIN_MAX_DEPENDENCIES) {
            invalid.value = true;
            return;
        }
        dependencyIds[dependency.id] = true;
        dependencies.push({ id: dependency.id, version: dependency.version });
    });
    var network = pluginSanitizeNetwork(raw.network, invalid);
    if (capabilities.indexOf('network.rpc') >= 0 && !network.length) invalid.value = true;
    if (capabilities.indexOf('network.rpc') < 0 && network.length) invalid.value = true;
    if (invalid.value) return null;
    return {
        id: raw.id,
        name: raw.name.trim(),
        version: raw.version,
        schemaVersion: PLUGIN_SCHEMA_VERSION,
        source: raw.source.trim(),
        description: String(raw.description || ''),
        capabilities: capabilities.sort(),
        dependencies: dependencies,
        network: network
    };
}

function pluginSanitizeResources(raw, invalid) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > PLUGIN_MAX_RESOURCES) { invalid.value = true; return []; }
    var paths = Object.create(null), total = 0, resources = [];
    raw.forEach(function(resource) {
        if (!pluginPlainRecord(resource) || !pluginOnlyKeys(resource, PLUGIN_RESOURCE_KEYS) ||
            typeof resource.path !== 'string' || !PLUGIN_RESOURCE_PATH_PATTERN.test(resource.path) ||
            paths[resource.path] || typeof resource.text !== 'string') {
            invalid.value = true;
            return;
        }
        var bytes = pluginTextBytes(resource.text);
        if (bytes > PLUGIN_MAX_RESOURCE_BYTES || total + bytes > PLUGIN_MAX_TOTAL_RESOURCE_BYTES) {
            invalid.value = true;
            return;
        }
        paths[resource.path] = true;
        total += bytes;
        resources.push({ path: resource.path, text: resource.text });
    });
    return resources;
}

function pluginNormalizePackage(raw) {
    if (!pluginPlainRecord(raw) || !pluginOnlyKeys(raw, PLUGIN_PACKAGE_KEYS)) throw new Error(t('plugin_import_invalid'));
    if (raw.type !== PLUGIN_PACKAGE_TYPE || Number(raw.formatVersion) !== PLUGIN_FORMAT_VERSION) throw new Error(t('plugin_import_invalid'));
    var invalid = { value: false };
    var manifest = pluginSanitizeManifest(raw.manifest, invalid);
    var resources = pluginSanitizeResources(raw.resources, invalid);
    if (invalid.value || !manifest) throw new Error(t('plugin_manifest_invalid'));
    if (!pluginPlainRecord(raw.entry) || !pluginOnlyKeys(raw.entry, ['code']) || typeof raw.entry.code !== 'string') {
        throw new Error(t('plugin_entry_invalid'));
    }
    var entryBytes = pluginTextBytes(raw.entry.code);
    if (!entryBytes || entryBytes > PLUGIN_MAX_ENTRY_BYTES) throw new Error(t('plugin_entry_too_large').replace('{limit}', pluginFormatBytes(PLUGIN_MAX_ENTRY_BYTES)));
    var record = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        source: manifest.source,
        description: manifest.description,
        capabilities: manifest.capabilities,
        dependencies: manifest.dependencies,
        network: manifest.network,
        digest: '',
        entry: { code: raw.entry.code },
        resources: resources
    };
    record.digest = pluginComputeDigest(record);
    if (raw.digest !== undefined && raw.digest !== record.digest) throw new Error(t('plugin_digest_mismatch'));
    return { record: record, digest: record.digest };
}

function pluginNormalizeInstalledRecord(raw) {
    if (!pluginPlainRecord(raw) || !pluginOnlyKeys(raw, PLUGIN_RECORD_KEYS)) return null;
    var invalid = { value: false };
    var manifest = pluginSanitizeManifest({
        id: raw.id,
        name: raw.name,
        version: raw.version,
        schemaVersion: raw.schemaVersion,
        source: raw.source,
        description: raw.description,
        capabilities: raw.capabilities,
        dependencies: raw.dependencies,
        network: raw.network
    }, invalid);
    var resources = pluginSanitizeResources(raw.resources, invalid);
    if (invalid.value || !manifest || !pluginPlainRecord(raw.entry) || !pluginOnlyKeys(raw.entry, ['code']) ||
        typeof raw.entry.code !== 'string' || !raw.entry.code || pluginTextBytes(raw.entry.code) > PLUGIN_MAX_ENTRY_BYTES ||
        typeof raw.digest !== 'string' || !PLUGIN_DIGEST_PATTERN.test(raw.digest) ||
        !Number.isFinite(Number(raw.installedAt)) || !Number.isFinite(Number(raw.updatedAt))) {
        return null;
    }
    var record = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        source: manifest.source,
        description: manifest.description,
        capabilities: manifest.capabilities,
        dependencies: manifest.dependencies,
        network: manifest.network,
        digest: raw.digest,
        entry: { code: raw.entry.code },
        resources: resources,
        installedAt: Number(raw.installedAt),
        updatedAt: Number(raw.updatedAt),
        previous: null
    };
    if (pluginComputeDigest(record) !== record.digest) return null;
    if (Number(raw.installedAt) > Number(raw.updatedAt)) return null;
    if (raw.previous !== undefined && raw.previous !== null) {
        var previous = pluginNormalizePrevious(raw.previous, manifest.id);
        if (!previous) return null;
        record.previous = previous;
    }
    return record;
}

function pluginNormalizePrevious(raw, ownerId) {
    if (!pluginPlainRecord(raw) || !pluginOnlyKeys(raw, PLUGIN_PREVIOUS_KEYS)) return null;
    var invalid = { value: false };
    var manifest = pluginSanitizeManifest({
        id: raw.id,
        name: raw.name,
        version: raw.version,
        schemaVersion: raw.schemaVersion,
        source: raw.source,
        description: raw.description,
        capabilities: raw.capabilities,
        dependencies: raw.dependencies,
        network: raw.network
    }, invalid);
    var resources = pluginSanitizeResources(raw.resources, invalid);
    if (raw.id !== ownerId || invalid.value || !manifest || !pluginPlainRecord(raw.entry) || !pluginOnlyKeys(raw.entry, ['code']) ||
        typeof raw.entry.code !== 'string' || !raw.entry.code || pluginTextBytes(raw.entry.code) > PLUGIN_MAX_ENTRY_BYTES ||
        typeof raw.digest !== 'string' || !PLUGIN_DIGEST_PATTERN.test(raw.digest) ||
        !Number.isFinite(Number(raw.savedAt))) return null;
    var previous = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        source: manifest.source,
        description: manifest.description,
        capabilities: manifest.capabilities,
        dependencies: manifest.dependencies,
        network: manifest.network,
        digest: raw.digest,
        entry: { code: raw.entry.code },
        resources: resources,
        savedAt: Number(raw.savedAt)
    };
    if (pluginComputeDigest(previous) !== previous.digest) return null;
    return previous;
}

function pluginSnapshotForRollback(record) {
    return {
        id: record.id,
        name: record.name,
        version: record.version,
        schemaVersion: record.schemaVersion,
        source: record.source,
        description: record.description || '',
        capabilities: (record.capabilities || []).slice(),
        dependencies: JSON.parse(JSON.stringify(record.dependencies || [])),
        network: JSON.parse(JSON.stringify(record.network || [])),
        digest: record.digest,
        entry: { code: record.entry.code },
        resources: JSON.parse(JSON.stringify(record.resources || [])),
        savedAt: Date.now()
    };
}

function pluginRecordFromPrevious(previous, id, installedAt) {
    return {
        id: id,
        name: previous.name,
        version: previous.version,
        schemaVersion: previous.schemaVersion,
        source: previous.source,
        description: previous.description || '',
        capabilities: (previous.capabilities || []).slice(),
        dependencies: JSON.parse(JSON.stringify(previous.dependencies || [])),
        network: JSON.parse(JSON.stringify(previous.network || [])),
        digest: previous.digest,
        entry: { code: previous.entry.code },
        resources: JSON.parse(JSON.stringify(previous.resources || [])),
        installedAt: Number(installedAt) || Date.now(),
        updatedAt: Date.now(),
        previous: null
    };
}

function pluginInstalledRecordFromPackage(record, now) {
    var installedAt = Number(now) || Date.now();
    var installed = {
        id: record.id,
        name: record.name,
        version: record.version,
        schemaVersion: record.schemaVersion,
        source: record.source,
        description: record.description || '',
        capabilities: (record.capabilities || []).slice(),
        dependencies: JSON.parse(JSON.stringify(record.dependencies || [])),
        network: JSON.parse(JSON.stringify(record.network || [])),
        digest: record.digest,
        entry: { code: record.entry.code },
        resources: JSON.parse(JSON.stringify(record.resources || [])),
        installedAt: installedAt,
        updatedAt: installedAt,
        previous: null
    };
    if (!pluginNormalizeInstalledRecord(installed)) throw new Error(t('plugin_invalid'));
    return installed;
}

function pluginVersionCompare(left, right) {
    var a = String(left || '').split('.').map(Number);
    var b = String(right || '').split('.').map(Number);
    for (var index = 0; index < 3; index++) {
        if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
}

function pluginSanitizePrivateValue(value, depth, budget) {
    if (depth > PLUGIN_MAX_PRIVATE_DEPTH) throw new Error(t('plugin_private_too_deep'));
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        budget.bytes += pluginTextBytes(value);
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(t('plugin_private_invalid'));
        budget.bytes += 16;
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length > PLUGIN_MAX_PRIVATE_ARRAY) throw new Error(t('plugin_private_too_large'));
        return value.map(function(item) { return pluginSanitizePrivateValue(item, depth + 1, budget); });
    }
    if (!pluginPlainRecord(value)) throw new Error(t('plugin_private_invalid'));
    var keys = Object.keys(value);
    if (keys.length > PLUGIN_MAX_PRIVATE_KEYS) throw new Error(t('plugin_private_too_large'));
    var result = {};
    keys.forEach(function(key) {
        if (PLUGIN_RESERVED_IDS.indexOf(key) >= 0 || !/^[a-z][a-z0-9._-]{0,63}$/.test(key)) throw new Error(t('plugin_private_invalid'));
        Object.defineProperty(result, key, {
            value: pluginSanitizePrivateValue(value[key], depth + 1, budget),
            writable: true, enumerable: true, configurable: true
        });
    });
    return result;
}

function pluginSanitizePrivateData(raw) {
    if (!pluginPlainRecord(raw)) throw new Error(t('plugin_private_invalid'));
    var budget = { bytes: 0 };
    var clean = pluginSanitizePrivateValue(raw, 0, budget);
    var bytes = pluginTextBytes(JSON.stringify(clean));
    if (bytes > PLUGIN_MAX_PRIVATE_BYTES) throw new Error(t('plugin_private_too_large'));
    return clean;
}

function pluginSanitizeGrant(raw) {
    if (!pluginPlainRecord(raw) || !pluginOnlyKeys(raw, PLUGIN_GRANT_KEYS)) return null;
    if (typeof raw.fingerprint !== 'string' || !PLUGIN_DIGEST_PATTERN.test(raw.fingerprint) ||
        !pluginVersionValid(raw.version) || typeof raw.digest !== 'string' || !PLUGIN_DIGEST_PATTERN.test(raw.digest) ||
        !Array.isArray(raw.capabilities) || raw.capabilities.length > PLUGIN_MAX_CAPABILITIES ||
        !Number.isFinite(Number(raw.grantedAt))) return null;
    var capabilities = [];
    raw.capabilities.forEach(function(capability) {
        if (typeof capability !== 'string' || PLUGIN_CAPABILITIES.indexOf(capability) < 0 || capabilities.indexOf(capability) >= 0) return;
        capabilities.push(capability);
    });
    var invalid = { value: false };
    var network = pluginSanitizeNetwork(raw.network, invalid);
    if (invalid.value) return null;
    return {
        fingerprint: raw.fingerprint,
        version: raw.version,
        digest: raw.digest,
        capabilities: capabilities.sort(),
        network: network,
        grantedAt: Number(raw.grantedAt)
    };
}

function pluginNormalizeSettingsObject(settings, strict) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        if (strict) throw new Error(t('plugin_settings_invalid'));
        return settings;
    }
    var rawPlugins = Array.isArray(settings.plugins) ? settings.plugins : [];
    if (!Array.isArray(settings.plugins)) {
        if (strict && settings.plugins !== undefined) throw new Error(t('plugin_settings_invalid'));
        rawPlugins = [];
    }
    if (rawPlugins.length > PLUGIN_MAX_PLUGINS) {
        if (strict) throw new Error(t('plugin_limit'));
        rawPlugins = rawPlugins.slice(0, PLUGIN_MAX_PLUGINS);
    }
    var records = [], seen = Object.create(null), byId = Object.create(null);
    rawPlugins.forEach(function(raw) {
        var record = pluginNormalizeInstalledRecord(raw);
        if (!record || seen[record.id]) {
            if (strict) throw new Error(t('plugin_invalid'));
            return;
        }
        seen[record.id] = true;
        records.push(record);
        byId[record.id] = record;
    });
    var rawPrivate = settings.pluginPrivateData;
    if (rawPrivate !== undefined && !pluginPlainRecord(rawPrivate)) {
        if (strict) throw new Error(t('plugin_private_invalid'));
        rawPrivate = {};
    }
    var privateData = {};
    Object.keys(rawPrivate || {}).forEach(function(id) {
        if (!pluginIdValid(id)) {
            if (strict) throw new Error(t('plugin_private_invalid'));
            return;
        }
        try {
            privateData[id] = pluginSanitizePrivateData(rawPrivate[id]);
        } catch (error) {
            if (strict) throw error;
        }
    });
    var rawGrants = settings.pluginGrants;
    if (rawGrants !== undefined && !pluginPlainRecord(rawGrants)) {
        if (strict) throw new Error(t('plugin_grant_invalid'));
        rawGrants = {};
    }
    var grants = {};
    Object.keys(rawGrants || {}).forEach(function(id) {
        if (!byId[id]) return;
        var grant = pluginSanitizeGrant(rawGrants[id]);
        if (!grant) {
            if (strict) throw new Error(t('plugin_grant_invalid'));
            return;
        }
        Object.defineProperty(grants, id, { value: grant, writable: true, enumerable: true, configurable: true });
    });
    settings.plugins = records;
    settings.pluginPrivateData = privateData;
    settings.pluginGrants = grants;
    return settings;
}

function ensurePluginSettings(settings) {
    return pluginNormalizeSettingsObject(settings, false);
}

function validatePluginSettings(settings) {
    var candidate = pluginNormalizeSettingsObject(settings, true);
    if ((candidate.plugins || []).some(function(record) {
        return pluginDependencyCycle(record, candidate.plugins);
    })) throw new Error(t('plugin_dependency_cycle'));
    return candidate;
}

function pluginDependencyCycle(record, records) {
    var byId = Object.create(null);
    (records || []).forEach(function(item) { byId[item.id] = item; });
    var visiting = Object.create(null), visited = Object.create(null);
    function visit(id) {
        if (visiting[id]) return true;
        if (visited[id] || !byId[id]) return false;
        visiting[id] = true;
        var cycle = (byId[id].dependencies || []).some(function(dependency) { return visit(dependency.id); });
        visiting[id] = false;
        visited[id] = true;
        return cycle;
    }
    return visit(record.id);
}

function pluginDependencyIssues(record, records) {
    var byId = Object.create(null);
    (records || []).forEach(function(item) { byId[item.id] = item; });
    var issues = [];
    (record.dependencies || []).forEach(function(dependency) {
        var installed = byId[dependency.id];
        if (!installed) issues.push({ code: 'missing', id: dependency.id, version: dependency.version });
        else if (installed.version !== dependency.version) issues.push({ code: 'version', id: dependency.id, version: dependency.version, installedVersion: installed.version });
    });
    if (pluginDependencyCycle(record, records)) issues.push({ code: 'cycle', id: record.id });
    return issues;
}

function pluginDependents(records, pluginId) {
    var result = [], seen = Object.create(null);
    function visit(id) {
        (records || []).forEach(function(record) {
            if (seen[record.id] || !(record.dependencies || []).some(function(dependency) { return dependency.id === id; })) return;
            seen[record.id] = true;
            result.push(record);
            visit(record.id);
        });
    }
    visit(pluginId);
    return result;
}

function getInstalledPlugins(settings) {
    var source = settings || (typeof state !== 'undefined' ? state.settings : null);
    if (!source) return [];
    ensurePluginSettings(source);
    return source.plugins.slice();
}

function getInstalledPluginById(pluginId, settings) {
    return getInstalledPlugins(settings).find(function(record) { return record.id === pluginId; }) || null;
}

function getPluginGrant(pluginId, settings) {
    var source = settings || (typeof state !== 'undefined' ? state.settings : null);
    if (!source) return null;
    ensurePluginSettings(source);
    return source.pluginGrants[pluginId] || null;
}

function pluginGrantMissing(record, grant) {
    var missing = [];
    (record.capabilities || []).forEach(function(capability) {
        if (!grant || !Array.isArray(grant.capabilities) || grant.capabilities.indexOf(capability) < 0) missing.push(capability);
    });
    if (!grant || grant.fingerprint !== pluginFingerprint(record)) missing.push('__fingerprint__');
    var declared = (record.network || []).map(pluginNetworkRuleKey).sort().join('|');
    var granted = grant && Array.isArray(grant.network) ? grant.network.map(pluginNetworkRuleKey).sort().join('|') : '';
    if (declared !== granted) missing.push('__network__');
    return missing;
}

function isPluginGranted(record, grant) {
    return !!record && pluginGrantMissing(record, grant || null).length === 0;
}

function setPluginGrant(settings, record, capabilities) {
    if (!settings || !pluginPlainRecord(settings) || !record) return;
    if (!pluginPlainRecord(settings.pluginGrants)) settings.pluginGrants = {};
    var allowed = Array.isArray(capabilities) ? capabilities.filter(function(capability) {
        return (record.capabilities || []).indexOf(capability) >= 0;
    }) : [];
    settings.pluginGrants[record.id] = {
        fingerprint: pluginFingerprint(record),
        version: record.version,
        digest: record.digest,
        capabilities: Array.from(new Set(allowed)).sort(),
        network: JSON.parse(JSON.stringify(record.network || [])),
        grantedAt: Date.now()
    };
}

function clearPluginGrant(settings, pluginId) {
    if (!settings || !pluginPlainRecord(settings.pluginGrants)) return;
    if (Object.prototype.hasOwnProperty.call(settings.pluginGrants, pluginId)) delete settings.pluginGrants[pluginId];
}

function pluginDiffSummary(previous, next) {
    var changes = [];
    if (!previous) return changes;
    if (previous.version !== next.version) changes.push(t('plugin_diff_version').replace('{from}', previous.version).replace('{to}', next.version));
    if (previous.source !== next.source) changes.push(t('plugin_diff_source').replace('{from}', previous.source).replace('{to}', next.source));
    if (previous.digest !== next.digest) changes.push(t('plugin_diff_digest').replace('{from}', previous.digest.slice(7, 19)).replace('{to}', next.digest.slice(7, 19)));
    var beforeCaps = (previous.capabilities || []).slice().sort();
    var afterCaps = (next.capabilities || []).slice().sort();
    var addedCaps = afterCaps.filter(function(capability) { return beforeCaps.indexOf(capability) < 0; });
    var removedCaps = beforeCaps.filter(function(capability) { return afterCaps.indexOf(capability) < 0; });
    if (addedCaps.length) changes.push(t('plugin_diff_capabilities_added').replace('{items}', addedCaps.join(', ')));
    if (removedCaps.length) changes.push(t('plugin_diff_capabilities_removed').replace('{items}', removedCaps.join(', ')));
    var beforeNetwork = (previous.network || []).map(pluginNetworkRuleKey).sort();
    var afterNetwork = (next.network || []).map(pluginNetworkRuleKey).sort();
    if (JSON.stringify(beforeNetwork) !== JSON.stringify(afterNetwork)) changes.push(t('plugin_diff_network'));
    var beforeDeps = (previous.dependencies || []).map(function(dependency) { return dependency.id + '@' + dependency.version; }).sort().join(', ');
    var afterDeps = (next.dependencies || []).map(function(dependency) { return dependency.id + '@' + dependency.version; }).sort().join(', ');
    if (beforeDeps !== afterDeps) changes.push(t('plugin_diff_dependencies').replace('{from}', beforeDeps || '-').replace('{to}', afterDeps || '-'));
    var beforeBytes = pluginTextBytes(previous.entry && previous.entry.code || '');
    var afterBytes = pluginTextBytes(next.entry && next.entry.code || '');
    if (beforeBytes !== afterBytes) changes.push(t('plugin_diff_bytes').replace('{from}', pluginFormatBytes(beforeBytes)).replace('{to}', pluginFormatBytes(afterBytes)));
    return changes;
}

async function readPluginPackageFile(file) {
    if (!file || typeof file.text !== 'function') throw new Error(t('plugin_import_invalid'));
    if (Number(file.size) > PLUGIN_MAX_PACKAGE_BYTES) {
        throw new Error(t('plugin_package_too_large').replace('{limit}', pluginFormatBytes(PLUGIN_MAX_PACKAGE_BYTES)));
    }
    var text = await file.text();
    if (typeof text !== 'string') throw new Error(t('plugin_import_invalid'));
    if (pluginTextBytes(text) > PLUGIN_MAX_PACKAGE_BYTES) {
        throw new Error(t('plugin_package_too_large').replace('{limit}', pluginFormatBytes(PLUGIN_MAX_PACKAGE_BYTES)));
    }
    var parsed;
    try { parsed = JSON.parse(text); } catch (error) { throw new Error(t('plugin_import_invalid')); }
    return normalizePluginPackage(parsed).record;
}

function normalizePluginPackage(raw) {
    return pluginNormalizePackage(raw);
}

function pluginSettingsSnapshot() {
    ensurePluginSettings(state.settings);
    return JSON.stringify({
        plugins: state.settings.plugins,
        pluginPrivateData: state.settings.pluginPrivateData,
        pluginGrants: state.settings.pluginGrants
    });
}

function pluginSettingsPartEqual(left, right) {
    try { return pluginCanonical(left) === pluginCanonical(right); } catch (error) { return false; }
}

// 后续 pending 快照只接收本事务实际拥有、且仍停留在旧基线的插件命名空间；
// 已被其他合法事务改写的命名空间保持原样。
function pluginMergeCommittedNamespaces(target, baseline, candidate) {
    var merged = pluginPlainRecord(target) ? target : {};
    var base = pluginPlainRecord(baseline) ? baseline : {};
    var next = pluginPlainRecord(candidate) ? candidate : {};
    var ids = Object.keys(base).concat(Object.keys(next)).filter(function(id, index, all) {
        return all.indexOf(id) === index;
    });
    ids.forEach(function(id) {
        if (!pluginSettingsPartEqual(merged[id], base[id])) return;
        if (Object.prototype.hasOwnProperty.call(next, id)) merged[id] = JSON.parse(JSON.stringify(next[id]));
        else if (Object.prototype.hasOwnProperty.call(base, id)) delete merged[id];
    });
    return merged;
}

function pluginMergeCommittedSettings(snapshot, baseline, candidate) {
    if (!snapshot || !pluginPlainRecord(snapshot.settings)) return;
    var base = JSON.parse(baseline);
    if (pluginSettingsPartEqual(snapshot.settings.plugins, base.plugins)) {
        snapshot.settings.plugins = JSON.parse(JSON.stringify(candidate.plugins || []));
    }
    snapshot.settings.pluginPrivateData = pluginMergeCommittedNamespaces(
        snapshot.settings.pluginPrivateData, base.pluginPrivateData, candidate.pluginPrivateData
    );
    snapshot.settings.pluginGrants = pluginMergeCommittedNamespaces(
        snapshot.settings.pluginGrants, base.pluginGrants, candidate.pluginGrants
    );
}

async function savePluginSettingsChange(mutator, options) {
    options = options || {};
    if (failedPluginDraft) throw new Error(t('plugin_draft_pending'));
    var root = state.settings;
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensurePluginSettings(candidate);
    mutator(candidate);
    validatePluginSettings(candidate);
    var baseline = options.baseline || pluginSettingsSnapshot();
    var callerBeforePersist = options.beforePersist;
    var callerAfterPersist = options.afterPersist;
    function check() {
        if (state.settings !== root) throw new Error(t('plugin_settings_replaced'));
        if (pluginSettingsSnapshot() !== baseline) throw new Error(t('plugin_settings_changed'));
    }
    try {
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: function() {
                check();
                if (typeof callerBeforePersist === 'function') callerBeforePersist();
            },
            transformSnapshot: function(snapshot) {
                snapshot.settings.plugins = JSON.parse(JSON.stringify(candidate.plugins));
                snapshot.settings.pluginPrivateData = JSON.parse(JSON.stringify(candidate.pluginPrivateData));
                snapshot.settings.pluginGrants = JSON.parse(JSON.stringify(candidate.pluginGrants));
                return snapshot;
            },
            onPersistSuccess: function() {
                check();
                if (typeof callerAfterPersist === 'function') callerAfterPersist();
                state.settings.plugins = JSON.parse(JSON.stringify(candidate.plugins));
                state.settings.pluginPrivateData = JSON.parse(JSON.stringify(candidate.pluginPrivateData));
                state.settings.pluginGrants = JSON.parse(JSON.stringify(candidate.pluginGrants));
            },
            commitPendingSnapshot: function(snapshot) {
                pluginMergeCommittedSettings(snapshot, baseline, candidate);
            }
        });
        failedPluginDraft = null;
        appStore.notify('settings');
        return true;
    } catch (error) {
        if (options.skipDraft !== true) failedPluginDraft = { candidate: candidate, root: root, baseline: baseline };
        throw error;
    }
}

async function retryPluginSettingsChange() {
    var draft = failedPluginDraft;
    if (!draft) return false;
    if (state.settings !== draft.root || pluginSettingsSnapshot() !== draft.baseline) {
        failedPluginDraft = null;
        throw new Error(t('plugin_settings_changed'));
    }
    failedPluginDraft = null;
    return savePluginSettingsChange(function(candidate) {
        candidate.plugins = JSON.parse(JSON.stringify(draft.candidate.plugins));
        candidate.pluginPrivateData = JSON.parse(JSON.stringify(draft.candidate.pluginPrivateData));
        candidate.pluginGrants = JSON.parse(JSON.stringify(draft.candidate.pluginGrants));
    }, { baseline: draft.baseline });
}

function pluginPrivateDataFor(settings, pluginId) {
    var source = settings || state.settings;
    if (!source || !pluginPlainRecord(source.pluginPrivateData)) return {};
    var data = source.pluginPrivateData[pluginId];
    return pluginPlainRecord(data) ? JSON.parse(JSON.stringify(data)) : {};
}

function pluginPrivateDataExport(pluginId) {
    if (!pluginIdValid(pluginId)) throw new Error(t('plugin_private_invalid'));
    return {
        type: 'opentavern-plugin-data',
        formatVersion: 1,
        pluginId: pluginId,
        data: pluginPrivateDataFor(state.settings, pluginId),
        exportedAt: new Date().toISOString()
    };
}

function pluginPrivateDataIds(settings) {
    var source = settings || state.settings;
    return Object.keys(pluginPlainRecord(source && source.pluginPrivateData) ? source.pluginPrivateData : {});
}

function validateRestoredPluginSettings(settings) {
    if (!pluginPlainRecord(settings) || !pluginPlainRecord(settings.settings)) throw new Error(t('plugin_settings_invalid'));
    var source = settings.settings;
    if (source.plugins === undefined && source.pluginPrivateData === undefined) return;
    var candidate = {
        plugins: source.plugins === undefined ? [] : source.plugins,
        pluginPrivateData: source.pluginPrivateData === undefined ? {} : source.pluginPrivateData
    };
    validatePluginSettings(candidate);
    if (source.plugins !== undefined) source.plugins = candidate.plugins;
    if (source.pluginPrivateData !== undefined) source.pluginPrivateData = candidate.pluginPrivateData;
}
