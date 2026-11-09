/**
 * 新手导读（文件：32-content-modules.js）
 *
 * 负责什么：声明式内容模块的数据模型、规范化、校验、依赖、绑定和可靠保存事务。
 * 在程序中的位置：模块定义、绑定和会话停用记录存放在 settings；本机内容许可单独存放，
 * 运行装配由 40-content-module-runtime.js 负责，管理界面在 68-content-modules-ui.js。
 * 从哪里开始看：`ensureContentModuleSettings(settings)`、`saveContentModulesChange(mutator)`、
 * `importContentModuleData(raw)`、`setContentModuleGrant(settings, moduleId, true)`。
 * 修改时注意：导入/恢复/云同步永远不能自动取得本机执行许可；含发送动作的规则还需单独的本机发送授权。
 */
// ==================== Content Module Definitions ====================
var CONTENT_MODULE_FORMAT_VERSION = 1;
var CONTENT_MODULE_MAX_MODULES = 12;
var CONTENT_MODULE_MAX_WORLD_BOOKS = 8;
var CONTENT_MODULE_MAX_WORLD_ENTRIES = 60;
var CONTENT_MODULE_MAX_REGEX = 40;
var CONTENT_MODULE_MAX_RULES = 40;
var CONTENT_MODULE_MAX_SCENES = 20;
var CONTENT_MODULE_MAX_SCENE_EVENTS = 60;
var CONTENT_MODULE_MAX_ASSETS = 4;
var CONTENT_MODULE_MAX_DEPENDENCIES = 8;
var CONTENT_MODULE_MAX_HOST_REFS = 20;
var CONTENT_MODULE_MAX_PREVIOUS = 1;
var CONTENT_MODULE_MAX_NAME = 80;
var CONTENT_MODULE_MAX_SOURCE = 200;
var CONTENT_MODULE_MAX_DESCRIPTION = 1000;
var CONTENT_MODULE_MAX_ENTRY_TEXT = 20000;
var CONTENT_MODULE_MAX_TARGET = 200;
// 导出包不含旧版快照；16 MiB 同时覆盖当前 4×1 MiB/合计 2 MiB 素材编码、
// 60 条 20000 字条目和一份旧版快照，读取文件前即拒绝超限包。
var CONTENT_MODULE_MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
var CONTENT_MODULE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
// 这些 ID 作为普通对象键会命中原型 setter，许可无法存为自身属性；按格式无效处理。
var CONTENT_MODULE_RESERVED_IDS = ['__proto__', 'prototype', 'constructor'];
var CONTENT_MODULE_KEYS = [
    'id', 'formatVersion', 'version', 'name', 'description', 'source', 'order', 'revision',
    'createdAt', 'updatedAt', 'items', 'assets', 'dependencies', 'hostQuickReplyRefs', 'previousVersions'
];
var CONTENT_MODULE_ITEM_KEYS = ['worldBooks', 'regexScripts', 'automationRules', 'scenePackages'];
var CONTENT_MODULE_PACKAGE_KEYS = ['type', 'formatVersion', 'module'];
var CONTENT_MODULE_ENTRY_REF_PREFIX = 'module-entry:';
var failedContentModuleDraft = null;

function contentModulePlainRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function contentModuleBoundedText(value, limit, allowEmpty) {
    return typeof value === 'string' && value.length <= limit && (allowEmpty === true || value.trim() !== '');
}

function contentModuleOnlyKeys(value, keys) {
    if (!contentModulePlainRecord(value)) return false;
    return Object.keys(value).every(function(key) { return keys.indexOf(key) >= 0; });
}

function contentModuleVersionValid(value) {
    return typeof value === 'string' && CONTENT_MODULE_VERSION_PATTERN.test(value);
}

function contentModuleNewId(prefix) {
    return (prefix || 'content-module') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// 组件身份逐段做 URI 编码，模块/书本/条目 ID 即使含 ':' 也不会压平成同一 uid。
function contentModuleEncodeId(value) {
    return encodeURIComponent(String(value == null ? '' : value));
}

function contentModuleDecodeId(value) {
    try { return decodeURIComponent(value); } catch (error) { return null; }
}

function contentModuleNamespaced() {
    var parts = ['cm'];
    for (var index = 0; index < arguments.length; index++) parts.push(contentModuleEncodeId(arguments[index]));
    return parts.join(':');
}

function contentModuleParseNamespaced(value) {
    var raw = String(value || '');
    if (raw.indexOf('cm:') !== 0) return null;
    var parts = raw.slice(3).split(':');
    if (parts.length < 2) return null;
    var decoded = [];
    for (var index = 0; index < parts.length; index++) {
        var part = contentModuleDecodeId(parts[index]);
        if (part === null) return null;
        decoded.push(part);
    }
    return { moduleId: decoded[0], kind: decoded[1], itemId: decoded[2] || '', parts: decoded.slice(2) };
}

// 本机许可指纹使用现有 vendor SHA-256；HTTP 下同样有效，且不接受包内声明的哈希。
var contentModuleReadySettings = typeof WeakSet === 'function' ? new WeakSet() : null;

function contentModuleSha256Hex(input) {
    var sha = typeof window !== 'undefined' && window && typeof window.sha256 === 'function' ? window.sha256 : null;
    if (!sha) throw new Error(t('content_module_crypto_unavailable'));
    return 'sha256:' + sha(input);
}

function contentModuleCanonical(value) {
    return JSON.stringify(value, function(_key, current) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        var sorted = Object.create(null);
        Object.keys(current).sort().forEach(function(key) { sorted[key] = current[key]; });
        return sorted;
    });
}

function contentModuleDecodeBase64(text) {
    if (typeof atob !== 'function') throw new Error(t('content_module_media_unsupported'));
    var binary = atob(String(text || ''));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function contentModuleDetectAssetMime(bytes) {
    if (typeof detectPrivateMediaSignatureMime === 'function') return detectPrivateMediaSignatureMime(bytes);
    if (!bytes || bytes.length < 12) return '';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    var head6 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' &&
        String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP') return 'image/webp';
    return '';
}

function contentModuleDecodeAssetDataUrl(dataUrl) {
    var match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
    if (!match) throw new Error(t('content_module_asset_invalid'));
    var declared = String(match[1]).toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(match[1]).toLowerCase();
    var encoded = match[2];
    if (!encoded || encoded.length > Math.ceil(contentModuleAssetLimit() / 3) * 4 + 8) {
        throw new Error(t('content_module_asset_too_large').replace('{limit}', contentModuleFormatBytes(contentModuleAssetLimit())));
    }
    var bytes;
    try { bytes = contentModuleDecodeBase64(encoded); } catch (error) { throw new Error(t('content_module_asset_invalid')); }
    if (!bytes.length || bytes.length > contentModuleAssetLimit()) {
        throw new Error(t('content_module_asset_too_large').replace('{limit}', contentModuleFormatBytes(contentModuleAssetLimit())));
    }
    var detected = contentModuleDetectAssetMime(bytes);
    if (!detected) throw new Error(t('content_module_asset_unsupported'));
    if (declared !== detected) throw new Error(t('content_module_asset_mismatch'));
    return { mime: detected, bytes: bytes };
}

function contentModuleAssetSummary(asset) {
    if (!contentModulePlainRecord(asset)) return null;
    var id = String(asset.id || '').trim();
    var dataUrl = String(asset.dataUrl || '');
    if (!id || !dataUrl) return null;
    var decoded;
    try { decoded = contentModuleDecodeAssetDataUrl(dataUrl); } catch (error) { return null; }
    return {
        id: id,
        name: String(asset.name || id).trim().slice(0, CONTENT_MODULE_MAX_NAME) || id,
        mime: decoded.mime,
        bytes: decoded.bytes.length,
        hash: contentModuleSha256Hex(decoded.bytes),
        dataUrl: dataUrl
    };
}

function contentModuleSanitizeWorldBookEntry(raw, index, usedIds) {
    if (!contentModulePlainRecord(raw)) return null;
    var normalizedEntry = typeof normalizeWIEntry === 'function' ? normalizeWIEntry(raw) : raw;
    if (!contentModulePlainRecord(normalizedEntry)) return null;
    raw = normalizedEntry;
    var content = raw.content;
    if (typeof content !== 'string' || content.length > CONTENT_MODULE_MAX_ENTRY_TEXT) return null;
    var providedId = String(raw.id || '').trim();
    if (providedId && usedIds[providedId]) return null;
    var id = providedId || 'entry-' + index;
    while (usedIds[id]) id += '-' + index;
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) return null;
    usedIds[id] = true;
    var entry = {};
    Object.keys(raw).forEach(function(key) {
        if (key === 'id' || key === 'uid' || key === '_sourceWorldBookId' || key.indexOf('_module') === 0) return;
        entry[key] = JSON.parse(JSON.stringify(raw[key]));
    });
    entry.id = id;
    entry.content = content;
    if (entry.assetIds !== undefined) {
        if (!Array.isArray(entry.assetIds) || entry.assetIds.length > CONTENT_MODULE_MAX_ASSETS) return null;
        entry.assetIds = Array.from(new Set(entry.assetIds.map(String).filter(Boolean)));
    }
    return entry;
}

function contentModuleSanitizeWorldBook(raw, index, usedIds, entryIds) {
    if (!contentModulePlainRecord(raw) || !Array.isArray(raw.entries)) return null;
    if (raw.entries.length > CONTENT_MODULE_MAX_WORLD_ENTRIES) return null;
    var providedId = String(raw.id || '').trim();
    if (providedId && usedIds[providedId]) return null;
    var id = providedId || 'book-' + index;
    while (usedIds[id]) id += '-' + index;
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) return null;
    usedIds[id] = true;
    entryIds = entryIds || Object.create(null);
    var entries = raw.entries.map(function(entry, entryIndex) {
        return contentModuleSanitizeWorldBookEntry(entry, entryIndex, entryIds);
    });
    if (entries.some(function(entry) { return !entry; })) return null;
    return { id: id, name: String(raw.name || id).trim().slice(0, CONTENT_MODULE_MAX_NAME) || id, entries: entries };
}

function contentModuleSanitizeRegex(raw, index, usedIds) {
    if (!contentModulePlainRecord(raw)) return null;
    var providedId = String(raw.id || '').trim();
    if (providedId && usedIds[providedId]) return null;
    var id = providedId || 'regex-' + index;
    while (usedIds[id]) id += '-' + index;
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) return null;
    usedIds[id] = true;
    var script = JSON.parse(JSON.stringify(raw));
    delete script.id;
    delete script.uid;
    delete script._moduleId;
    delete script._moduleScriptId;
    script.id = id;
    try { validateRegexScript(script); } catch (error) { return null; }
    return script;
}

function contentModuleSanitizeRule(raw, index, usedIds) {
    if (!contentModulePlainRecord(raw)) return null;
    var providedId = String(raw.id || '').trim();
    if (providedId && usedIds[providedId]) return null;
    var id = providedId || 'rule-' + index;
    while (usedIds[id]) id += '-' + index;
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) return null;
    usedIds[id] = true;
    var copy = JSON.parse(JSON.stringify(raw));
    copy.id = id;
    copy.scope = 'global';
    copy.targetId = '';
    copy.enabled = true;
    copy.order = index;
    if (!Array.isArray(copy.conditions) || copy.conditions.some(function(condition) { return !contentModulePlainRecord(condition) || !String(condition.id || '').trim(); }) ||
        copy.actions.some(function(action) { return !contentModulePlainRecord(action) || !String(action.id || '').trim(); })) {
        return null;
    }
    var normalized = normalizeAutomationRule(copy, index, Object.create(null));
    if (!normalized || normalized.invalid === true) return null;
    try { validateAutomationRule(normalized); } catch (error) { return null; }
    normalized.id = id;
    normalized.enabled = true;
    normalized.scope = 'global';
    normalized.targetId = '';
    return normalized;
}

function contentModuleSanitizeScene(raw, index, usedIds) {
    if (!contentModulePlainRecord(raw) || !Array.isArray(raw.events)) return null;
    if (raw.events.length > CONTENT_MODULE_MAX_SCENE_EVENTS) return null;
    var providedId = String(raw.id || '').trim();
    if (providedId && usedIds[providedId]) return null;
    var id = providedId || 'scene-' + index;
    while (usedIds[id]) id += '-' + index;
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) return null;
    usedIds[id] = true;
    var eventIds = Object.create(null);
    var events = raw.events.map(function(event, eventIndex) {
        if (!contentModulePlainRecord(event)) return null;
        var copy = JSON.parse(JSON.stringify(event));
        var providedEventId = String(copy.id || '').trim();
        if (providedEventId && eventIds[providedEventId]) return null;
        copy.id = providedEventId || 'event-' + eventIndex;
        if (!contentModuleBoundedText(copy.id, CONTENT_MODULE_MAX_TARGET)) return null;
        if (!Array.isArray(copy.conditions) || copy.conditions.some(function(condition) { return !contentModulePlainRecord(condition) || !String(condition.id || '').trim(); }) ||
            !Array.isArray(copy.mvu) || copy.mvu.some(function(change) { return !contentModulePlainRecord(change) || !String(change.id || '').trim(); })) {
            return null;
        }
        copy.order = eventIndex;
        return normalizeSceneEvent(copy, eventIndex, eventIds);
    });
    if (events.some(function(event) { return !event || event.invalid === true; })) return null;
    var pack = {
        id: id, revision: 0,
        name: String(raw.name || id).trim().slice(0, CONTENT_MODULE_MAX_NAME) || id,
        enabled: true, scope: 'global', targetId: '', order: index, events: events
    };
    try { validateScenePackage(pack); } catch (error) { return null; }
    return pack;
}

function contentModuleSanitizeItems(raw, invalidRef) {
    if (raw !== undefined && !contentModulePlainRecord(raw)) { invalidRef.value = true; raw = {}; }
    raw = raw || {};
    var items = { worldBooks: [], regexScripts: [], automationRules: [], scenePackages: [] };
    if (!contentModuleOnlyKeys(raw, CONTENT_MODULE_ITEM_KEYS)) invalidRef.value = true;
    var bookIds = Object.create(null), entryIds = Object.create(null), regexIds = Object.create(null), ruleIds = Object.create(null), sceneIds = Object.create(null);
    function boundedList(key, limit) {
        if (raw[key] === undefined) return [];
        if (!Array.isArray(raw[key]) || raw[key].length > limit) { invalidRef.value = true; return []; }
        return raw[key];
    }
    boundedList('worldBooks', CONTENT_MODULE_MAX_WORLD_BOOKS).forEach(function(book, index) {
        var normalized = contentModuleSanitizeWorldBook(book, index, bookIds, entryIds);
        if (!normalized) invalidRef.value = true; else items.worldBooks.push(normalized);
    });
    if (items.worldBooks.reduce(function(sum, book) { return sum + (book.entries || []).length; }, 0) > CONTENT_MODULE_MAX_WORLD_ENTRIES) invalidRef.value = true;
    var automationIds = Object.create(null);
    items.worldBooks.forEach(function(book) {
        (book.entries || []).forEach(function(entry) {
            [String(entry.automationId || ''), String(entry.id || '')].forEach(function(key) {
                if (!key) return;
                if (automationIds[key] && automationIds[key] !== entry.id) { invalidRef.value = true; return; }
                automationIds[key] = entry.id;
            });
        });
    });
    // 作者在宿主里选中的 automationId 属于这个模块的条目，投影命名空间后必须仍指向同一条目。
    function remapConditions(conditions) {
        (conditions || []).forEach(function(condition) {
            if (!condition || condition.source !== 'worldbook-entry') return;
            var value = String(condition.value == null ? '' : condition.value);
            if (!value || value.indexOf(CONTENT_MODULE_ENTRY_REF_PREFIX) === 0 || !automationIds[value]) return;
            condition.value = CONTENT_MODULE_ENTRY_REF_PREFIX + automationIds[value];
        });
    }
    boundedList('regexScripts', CONTENT_MODULE_MAX_REGEX).forEach(function(script, index) {
        var normalized = contentModuleSanitizeRegex(script, index, regexIds);
        if (!normalized) invalidRef.value = true; else items.regexScripts.push(normalized);
    });
    boundedList('automationRules', CONTENT_MODULE_MAX_RULES).forEach(function(rule, index) {
        var normalized = contentModuleSanitizeRule(rule, index, ruleIds);
        if (!normalized) { invalidRef.value = true; return; }
        remapConditions(normalized.conditions);
        items.automationRules.push(normalized);
    });
    boundedList('scenePackages', CONTENT_MODULE_MAX_SCENES).forEach(function(scene, index) {
        var normalized = contentModuleSanitizeScene(scene, index, sceneIds);
        if (!normalized) { invalidRef.value = true; return; }
        (normalized.events || []).forEach(function(event) { remapConditions(event.conditions); });
        items.scenePackages.push(normalized);
    });
    return items;
}

function contentModuleSanitizeDependencies(raw, invalidRef) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > CONTENT_MODULE_MAX_DEPENDENCIES) { invalidRef.value = true; return []; }
    var seen = Object.create(null);
    return raw.map(function(dependency) {
        if (!contentModulePlainRecord(dependency) || !contentModuleBoundedText(dependency.moduleId, CONTENT_MODULE_MAX_TARGET) ||
            !contentModuleVersionValid(dependency.version) || seen[dependency.moduleId]) {
            invalidRef.value = true;
            return null;
        }
        seen[dependency.moduleId] = true;
        return { moduleId: dependency.moduleId, version: dependency.version };
    }).filter(Boolean);
}

function contentModuleSanitizeHostRefs(raw, invalidRef) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > CONTENT_MODULE_MAX_HOST_REFS) { invalidRef.value = true; return []; }
    var seen = Object.create(null);
    return raw.map(function(ref) {
        if (!contentModulePlainRecord(ref) || !contentModuleBoundedText(ref.groupId, CONTENT_MODULE_MAX_TARGET) ||
            !contentModuleBoundedText(ref.buttonId, CONTENT_MODULE_MAX_TARGET)) {
            invalidRef.value = true;
            return null;
        }
        var key = ref.groupId + '\n' + ref.buttonId;
        if (seen[key]) { invalidRef.value = true; return null; }
        seen[key] = true;
        return { groupId: ref.groupId, buttonId: ref.buttonId };
    }).filter(Boolean);
}

function contentModuleSanitizeAssets(raw, invalidRef) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > CONTENT_MODULE_MAX_ASSETS) { invalidRef.value = true; return []; }
    var assetIds = Object.create(null);
    var assets = raw.map(function(asset) {
        var summary = contentModuleAssetSummary(asset);
        if (!summary) { invalidRef.value = true; return null; }
        if (assetIds[summary.id]) { invalidRef.value = true; return null; }
        assetIds[summary.id] = true;
        if (!asset.name) summary.name = String(asset.name || summary.id);
        return summary;
    }).filter(Boolean);
    if (assets.reduce(function(sum, asset) { return sum + asset.bytes; }, 0) > contentModuleTotalLimit()) invalidRef.value = true;
    return assets;
}

function contentModuleNormalizePreviousVersions(raw, invalidRef) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > CONTENT_MODULE_MAX_PREVIOUS) { invalidRef.value = true; return []; }
    return raw.map(function(previous) {
        if (!contentModulePlainRecord(previous) || !contentModuleVersionValid(previous.version)) { invalidRef.value = true; return null; }
        var snapshotInvalid = { value: false };
        var items = contentModuleSanitizeItems(previous.items, snapshotInvalid);
        var assets = contentModuleSanitizeAssets(previous.assets, snapshotInvalid);
        var dependencies = contentModuleSanitizeDependencies(previous.dependencies, snapshotInvalid);
        var snapshot = {
            version: previous.version,
            revision: Number.isFinite(Number(previous.revision)) ? Number(previous.revision) : 0,
            savedAt: Number(previous.savedAt) || 0,
            items: items,
            assets: assets,
            dependencies: dependencies,
            hostQuickReplyRefs: contentModuleCollectHostQuickReplyRefs(items)
        };
        if (snapshotInvalid.value || !contentModuleValidateReferences(snapshot) || (!contentModuleItemCount(snapshot) && !assets.length)) {
            invalidRef.value = true;
            return null;
        }
        return snapshot;
    }).filter(Boolean);
}

function normalizeContentModule(raw, index, usedIds) {
    if (!contentModulePlainRecord(raw)) return null;
    var invalidRef = { value: raw.invalid === true };
    var id = String(raw.id || '').trim();
    while (!id || usedIds[id]) id = contentModuleNewId('content-module');
    if (!contentModuleBoundedText(id, CONTENT_MODULE_MAX_TARGET)) { invalidRef.value = true; id = contentModuleNewId('content-module'); }
    if (CONTENT_MODULE_RESERVED_IDS.indexOf(id) >= 0) { invalidRef.value = true; id = contentModuleNewId('content-module'); }
    usedIds[id] = true;
    var items = contentModuleSanitizeItems(raw.items, invalidRef);
    var assets = contentModuleSanitizeAssets(raw.assets, invalidRef);
    var dependencies = contentModuleSanitizeDependencies(raw.dependencies, invalidRef);
    contentModuleSanitizeHostRefs(raw.hostQuickReplyRefs, invalidRef);
    // 宿主引用必须从实际规则动作重新推导，不能信任导入包自带的空表或旧表。
    var hostQuickReplyRefs = contentModuleCollectHostQuickReplyRefs(items);
    var previousVersions = contentModuleNormalizePreviousVersions(raw.previousVersions, invalidRef);
    var module = {
        id: id,
        formatVersion: Number(raw.formatVersion) || 0,
        version: String(raw.version || ''),
        name: String(raw.name || '').trim().slice(0, CONTENT_MODULE_MAX_NAME) || t('content_module_unnamed'),
        description: String(raw.description || '').slice(0, CONTENT_MODULE_MAX_DESCRIPTION),
        source: String(raw.source || '').trim().slice(0, CONTENT_MODULE_MAX_SOURCE),
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
        revision: Number.isFinite(Number(raw.revision)) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        items: items,
        assets: assets,
        dependencies: dependencies,
        hostQuickReplyRefs: hostQuickReplyRefs,
        previousVersions: previousVersions
    };
    if (module.formatVersion !== CONTENT_MODULE_FORMAT_VERSION || !contentModuleVersionValid(module.version)) invalidRef.value = true;
    if (invalidRef.value) module.invalid = true;
    return module;
}

function contentModuleItemCount(module) {
    var items = module && module.items || {};
    return (items.worldBooks || []).reduce(function(sum, book) { return sum + (book.entries || []).length; }, 0) +
        (items.regexScripts || []).length + (items.automationRules || []).length + (items.scenePackages || []).length;
}

function contentModuleAssetUsage(module, assetId) {
    var used = [];
    var items = module && module.items || {};
    (items.worldBooks || []).forEach(function(book) {
        (book.entries || []).forEach(function(entry) {
            if (Array.isArray(entry.assetIds) && entry.assetIds.indexOf(assetId) >= 0) used.push(book.name + ' · ' + (entry.comment || entry.id));
        });
    });
    return used;
}

// 指纹绑定可执行内容、版本、来源、执行顺序与素材实际字节；名称和说明不参与。
function contentModuleFingerprint(module) {
    if (!contentModulePlainRecord(module)) return '';
    var items = module.items || {};
    var payload = {
        id: String(module.id || ''),
        version: String(module.version || ''),
        source: String(module.source || ''),
        worldBooks: items.worldBooks || [],
        regexScripts: items.regexScripts || [],
        automationRules: items.automationRules || [],
        scenePackages: items.scenePackages || [],
        assets: (module.assets || []).map(function(asset) { return { id: String(asset.id || ''), dataUrl: String(asset.dataUrl || '') }; }),
        dependencies: module.dependencies || [],
        hostQuickReplyRefs: module.hostQuickReplyRefs || []
    };
    return contentModuleSha256Hex(contentModuleCanonical(payload));
}

function contentModuleDependencyState(module, modulesById, options) {
    if (!module || !Array.isArray(module.dependencies)) return '';
    for (var index = 0; index < module.dependencies.length; index++) {
        var dependency = module.dependencies[index];
        var target = modulesById[dependency.moduleId];
        if (!target) return t('content_module_dependency_missing');
        if (target.version !== dependency.version) return t('content_module_dependency_version');
    }
    if (options && options.includeCycle) {
        var visiting = options.visiting || Object.create(null);
        if (visiting[module.id]) return t('content_module_dependency_cycle');
        visiting[module.id] = true;
        for (var dependencyIndex = 0; dependencyIndex < module.dependencies.length; dependencyIndex++) {
            var cycle = contentModuleDependencyState(modulesById[module.dependencies[dependencyIndex].moduleId], modulesById, { includeCycle: true, visiting: visiting });
            if (cycle) return cycle;
        }
        delete visiting[module.id];
    }
    return '';
}

function contentModuleEntryIds(module) {
    var ids = Object.create(null);
    ((module && module.items && module.items.worldBooks) || []).forEach(function(book) {
        (book.entries || []).forEach(function(entry) { ids[entry.id] = book; });
    });
    return ids;
}

function contentModuleValidateReferences(module) {
    var entryIds = contentModuleEntryIds(module);
    var assetIds = Object.create(null);
    (module.assets || []).forEach(function(asset) { assetIds[asset.id] = true; });
    function checkCondition(condition) {
        if (!condition || condition.source !== 'worldbook-entry') return true;
        var value = String(condition.value == null ? '' : condition.value);
        // 未解析的原始身份会在运行时匹配宿主条目，模块规则不能借此扩成全站执行。
        if (value.indexOf(CONTENT_MODULE_ENTRY_REF_PREFIX) !== 0) return false;
        return !!entryIds[value.slice(CONTENT_MODULE_ENTRY_REF_PREFIX.length)];
    }
    function checkAssetIds(list) {
        return !list || list.every(function(id) { return !!assetIds[id]; });
    }
    var items = module.items || {};
    var valid = true;
    (items.worldBooks || []).forEach(function(book) {
        (book.entries || []).forEach(function(entry) {
            if (!checkAssetIds(entry.assetIds)) valid = false;
        });
    });
    (items.scenePackages || []).forEach(function(scene) {
        (scene.events || []).forEach(function(event) {
            (event.conditions || []).forEach(function(condition) { if (!checkCondition(condition)) valid = false; });
        });
    });
    (items.automationRules || []).forEach(function(rule) {
        (rule.conditions || []).forEach(function(condition) { if (!checkCondition(condition)) valid = false; });
    });
    return valid;
}

function validateContentModule(module, options) {
    options = options || {};
    if (!contentModulePlainRecord(module) || module.invalid === true) throw new Error(t('content_module_invalid'));
    if (CONTENT_MODULE_RESERVED_IDS.indexOf(String(module.id || '').trim()) >= 0) throw new Error(t('content_module_invalid'));
    if (Number(module.formatVersion) !== CONTENT_MODULE_FORMAT_VERSION) throw new Error(t('content_module_format_unsupported'));
    if (!contentModuleVersionValid(module.version)) throw new Error(t('content_module_version_invalid'));
    if (!String(module.name || '').trim()) throw new Error(t('content_module_name_required'));
    if (!contentModuleOnlyKeys(module.items || {}, CONTENT_MODULE_ITEM_KEYS)) throw new Error(t('content_module_invalid'));
    var items = module.items || {};
    var worldBookCount = (items.worldBooks || []).length;
    var entryCount = (items.worldBooks || []).reduce(function(sum, book) { return sum + (book.entries || []).length; }, 0);
    if (worldBookCount > CONTENT_MODULE_MAX_WORLD_BOOKS || entryCount > CONTENT_MODULE_MAX_WORLD_ENTRIES) throw new Error(t('content_module_items_invalid'));
    if ((items.regexScripts || []).length > CONTENT_MODULE_MAX_REGEX || (items.automationRules || []).length > CONTENT_MODULE_MAX_RULES ||
        (items.scenePackages || []).length > CONTENT_MODULE_MAX_SCENES) throw new Error(t('content_module_items_invalid'));
    if ((module.assets || []).length > CONTENT_MODULE_MAX_ASSETS) throw new Error(t('content_module_asset_too_many'));
    var totalAssetBytes = (module.assets || []).reduce(function(sum, asset) { return sum + (Number(asset.bytes) || 0); }, 0);
    if (totalAssetBytes > contentModuleTotalLimit()) {
        throw new Error(t('content_module_asset_too_large').replace('{limit}', contentModuleFormatBytes(contentModuleTotalLimit())));
    }
    if (!contentModuleItemCount(module) && !(module.assets || []).length) throw new Error(t('content_module_empty'));
    (items.worldBooks || []).forEach(function(book) {
        if (!book || !contentModuleBoundedText(book.name, CONTENT_MODULE_MAX_NAME) || !Array.isArray(book.entries)) throw new Error(t('content_module_items_invalid'));
        book.entries.forEach(function(entry) {
            if (!contentModuleBoundedText(entry && entry.id, CONTENT_MODULE_MAX_TARGET) ||
                !contentModuleBoundedText(entry && entry.content, CONTENT_MODULE_MAX_ENTRY_TEXT, true)) throw new Error(t('content_module_items_invalid'));
        });
    });
    (items.regexScripts || []).forEach(function(script) {
        try { validateRegexScript(script); } catch (error) { throw new Error(t('content_module_regex_invalid')); }
    });
    (items.automationRules || []).forEach(function(rule) {
        if (!rule || rule.scope !== 'global' || rule.targetId || rule.enabled !== true) throw new Error(t('content_module_rule_invalid'));
        try { validateAutomationRule(rule); } catch (error) { throw new Error(t('content_module_rule_invalid')); }
    });
    (items.scenePackages || []).forEach(function(scene) {
        try { validateScenePackage(scene); } catch (error) { throw new Error(t('content_module_scene_invalid')); }
    });
    if (!contentModuleValidateReferences(module)) throw new Error(t('content_module_reference_invalid'));
    if (options.modulesById) {
        var dependencyError = contentModuleDependencyState(module, options.modulesById, { includeCycle: true });
        if (dependencyError) throw new Error(dependencyError);
    }
    if (module.dependencies && module.dependencies.some(function(dependency) { return dependency.moduleId === module.id; })) {
        throw new Error(t('content_module_dependency_cycle'));
    }
    return module;
}

function normalizeContentModuleBinding(raw, index, usedIds, moduleIds) {
    if (!contentModulePlainRecord(raw)) return null;
    var moduleId = String(raw.moduleId || '').trim();
    if (!moduleIds || !moduleIds[moduleId]) return null;
    var scope = String(raw.scope || '').toLowerCase();
    if (['global', 'character', 'conversation'].indexOf(scope) < 0) return null;
    var targetId = scope === 'global' ? '' : String(raw.targetId || '').trim().slice(0, CONTENT_MODULE_MAX_TARGET);
    if (scope !== 'global' && !targetId) return null;
    var id = String(raw.id || '').trim() || 'content-module-binding-' + index;
    while (usedIds[id]) id += '-' + index;
    usedIds[id] = true;
    return { id: id, moduleId: moduleId, scope: scope, targetId: targetId, enabled: raw.enabled !== false, order: index };
}

function ensureContentModuleSettings(settings) {
    var explicitApply = arguments.length > 0 && settings !== undefined && settings !== null;
    settings = settings || (typeof state !== 'undefined' ? state.settings : null);
    if (!settings || typeof settings !== 'object') return settings;
    if (Object.prototype.hasOwnProperty.call(settings, '__contentModuleReady')) delete settings.__contentModuleReady;
    // 只有无参的 live 读取可以命中缓存；显式传入对象（候选、恢复、外来 apply）
    // 必须真实重跑规范化，避免 mutator 之后或外部写入被当成已校验数据。
    if (!explicitApply && contentModuleReadySettings && contentModuleReadySettings.has(settings)) return settings;
    if (!Array.isArray(settings.contentModules)) settings.contentModules = [];
    var usedIds = Object.create(null);
    settings.contentModules = settings.contentModules.map(function(module, index) {
        return normalizeContentModule(module, index, usedIds);
    }).filter(Boolean);
    settings.contentModules.forEach(function(module, index) {
        module.order = index;
        if (index >= CONTENT_MODULE_MAX_MODULES) module.invalid = true;
    });
    var moduleIds = Object.create(null);
    settings.contentModules.forEach(function(module) { moduleIds[module.id] = true; });
    if (!Array.isArray(settings.contentModuleBindings)) settings.contentModuleBindings = [];
    var bindingIds = Object.create(null);
    settings.contentModuleBindings = settings.contentModuleBindings.slice(0, CONTENT_MODULE_MAX_MODULES * 4).map(function(binding, index) {
        return normalizeContentModuleBinding(binding, index, bindingIds, moduleIds);
    }).filter(Boolean);
    settings.contentModuleBindings.forEach(function(binding, index) { binding.order = index; });
    if (!contentModulePlainRecord(settings.contentModuleConversationDisabled)) settings.contentModuleConversationDisabled = {};
    var disabled = Object.create(null);
    Object.keys(settings.contentModuleConversationDisabled).slice(0, 200).forEach(function(conversationId) {
        var values = settings.contentModuleConversationDisabled[conversationId];
        if (!Array.isArray(values)) return;
        var seen = Object.create(null);
        disabled[conversationId] = values.map(String).filter(function(moduleId) {
            if (!moduleIds[moduleId] || seen[moduleId]) return false;
            seen[moduleId] = true;
            return true;
        }).slice(0, CONTENT_MODULE_MAX_MODULES);
    });
    settings.contentModuleConversationDisabled = disabled;
    if (!contentModulePlainRecord(settings.contentModuleGrants)) settings.contentModuleGrants = {};
    var approvedByModule = Object.create(null);
    function cleanGrantMap(source) {
        var clean = {};
        Object.keys(source || {}).slice(0, CONTENT_MODULE_MAX_PREVIOUS + 2).forEach(function(version) {
            if (contentModuleVersionValid(version) && typeof source[version] === 'string' && source[version].indexOf('sha256:') === 0) clean[version] = source[version];
        });
        return clean;
    }
    Object.keys(settings.contentModuleGrants).forEach(function(moduleId) {
        if (!moduleIds[moduleId]) return;
        var grant = settings.contentModuleGrants[moduleId];
        var approved = grant && contentModulePlainRecord(grant.approved) ? grant.approved : (grant && contentModulePlainRecord(grant) ? grant : null);
        if (!approved) return;
        var clean = cleanGrantMap(approved);
        var send = cleanGrantMap(grant.send);
        var record = {};
        if (Object.keys(clean).length) record.approved = clean;
        if (Object.keys(send).length) record.send = send;
        if (Object.keys(record).length) approvedByModule[moduleId] = record;
    });
    settings.contentModuleGrants = approvedByModule;
    if (contentModuleReadySettings) contentModuleReadySettings.add(settings);
    return settings;
}

function getContentModules() {
    ensureContentModuleSettings();
    return (state.settings.contentModules || []).slice().sort(function(a, b) { return a.order - b.order; });
}

function getContentModuleById(id) {
    ensureContentModuleSettings();
    return (state.settings.contentModules || []).find(function(module) { return module.id === id; }) || null;
}

function getContentModuleBindings() {
    ensureContentModuleSettings();
    return (state.settings.contentModuleBindings || []).slice().sort(function(a, b) { return a.order - b.order; });
}

function getContentModuleGrant(moduleId) {
    ensureContentModuleSettings();
    var grants = state.settings.contentModuleGrants || {};
    var grant = Object.prototype.hasOwnProperty.call(grants, moduleId) ? grants[moduleId] : null;
    return grant && contentModulePlainRecord(grant.approved) ? grant.approved : {};
}

function isContentModuleAuthorized(module) {
    if (!module || !module.id) return false;
    // 只信实际安装的定义；调用方传入的旧对象或导出字段不能作为许可依据。
    var installed = getContentModuleById(module.id);
    if (!installed || installed.invalid === true) return false;
    var approved = getContentModuleGrant(installed.id);
    return approved[installed.version] === contentModuleFingerprint(installed);
}

function isContentModuleSendAuthorized(module) {
    if (!module || !isContentModuleAuthorized(module)) return false;
    var grants = state.settings.contentModuleGrants || {};
    var grant = Object.prototype.hasOwnProperty.call(grants, module.id) ? grants[module.id] : null;
    var send = grant && contentModulePlainRecord(grant.send) ? grant.send : {};
    return send[module.version] === contentModuleFingerprint(module);
}

function setContentModuleGrant(settings, moduleId, authorized) {
    if (!settings || typeof settings !== 'object') return;
    if (!contentModulePlainRecord(settings.contentModuleGrants)) settings.contentModuleGrants = {};
    var module = (settings.contentModules || []).find(function(item) { return item.id === moduleId; });
    if (!module || module.invalid === true) { delete settings.contentModuleGrants[moduleId]; return; }
    var grant = Object.prototype.hasOwnProperty.call(settings.contentModuleGrants, moduleId) ? settings.contentModuleGrants[moduleId] : null;
    if (!contentModulePlainRecord(grant)) grant = { approved: {} };
    if (!contentModulePlainRecord(grant.approved)) grant.approved = {};
    if (authorized === true) grant.approved[module.version] = contentModuleFingerprint(module);
    else delete grant.approved[module.version];
    if (!Object.keys(grant.approved).length) delete grant.approved;
    if (Object.keys(grant).length) settings.contentModuleGrants[moduleId] = grant;
    else delete settings.contentModuleGrants[moduleId];
}

function setContentModuleSendGrant(settings, moduleId, authorized) {
    if (!settings || typeof settings !== 'object') return;
    if (!contentModulePlainRecord(settings.contentModuleGrants)) settings.contentModuleGrants = {};
    var module = (settings.contentModules || []).find(function(item) { return item.id === moduleId; });
    if (!module || module.invalid === true) {
        var existing = Object.prototype.hasOwnProperty.call(settings.contentModuleGrants, moduleId) ? settings.contentModuleGrants[moduleId] : null;
        if (existing) delete existing.send;
        if (existing && !Object.keys(existing).length) delete settings.contentModuleGrants[moduleId];
        return;
    }
    var grant = Object.prototype.hasOwnProperty.call(settings.contentModuleGrants, moduleId) ? settings.contentModuleGrants[moduleId] : null;
    if (!contentModulePlainRecord(grant)) grant = {};
    if (!contentModulePlainRecord(grant.approved)) grant.approved = {};
    if (!contentModulePlainRecord(grant.send)) grant.send = {};
    if (authorized === true) grant.send[module.version] = contentModuleFingerprint(module);
    else delete grant.send[module.version];
    if (!Object.keys(grant.send).length) delete grant.send;
    if (Object.keys(grant).length) settings.contentModuleGrants[moduleId] = grant;
    else delete settings.contentModuleGrants[moduleId];
}

function getContentModuleSnapshot() {
    ensureContentModuleSettings();
    return JSON.stringify({
        modules: state.settings.contentModules,
        bindings: state.settings.contentModuleBindings,
        disabled: state.settings.contentModuleConversationDisabled,
        grants: state.settings.contentModuleGrants
    });
}

function markContentModuleSettingsReady(settings) {
    // 只把已校验设置快照的“就绪”传播到它的克隆；未校验的任意对象不能自行取得信任。
    if (settings && typeof settings === 'object' && contentModuleReadySettings &&
        typeof state !== 'undefined' && state.settings && contentModuleReadySettings.has(state.settings)) {
        contentModuleReadySettings.add(settings);
    }
    return settings;
}

async function saveContentModulesChange(mutator, options) {
    options = options || {};
    if (failedContentModuleDraft) throw new Error(t('content_module_draft_pending'));
    var root = state.settings;
    var baselineInvalidIds = Object.create(null);
    (Array.isArray(root.contentModules) ? root.contentModules : []).forEach(function(module) {
        if (module && module.invalid === true && module.id) baselineInvalidIds[module.id] = true;
    });
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureContentModuleSettings(candidate);
    mutator(candidate);
    if (Array.isArray(candidate.contentModules) && candidate.contentModules.length > CONTENT_MODULE_MAX_MODULES) throw new Error(t('content_module_limit'));
    // 候选在 mutator 之后可能被改成同 ID 或非法内容；这里拒绝重复 ID，
    // 随后第二次规范化会重新校验素材等字段，不能沿用 mutator 前的就绪缓存。
    var candidateIds = Object.create(null);
    if (Array.isArray(candidate.contentModules)) {
        candidate.contentModules.forEach(function(module) {
            if (!module || typeof module !== 'object') return;
            var id = String(module.id || '').trim();
            if (!id) return;
            if (candidateIds[id]) throw new Error(t('content_module_invalid'));
            candidateIds[id] = true;
        });
    }
    ensureContentModuleSettings(candidate);
    var modulesById = Object.create(null);
    candidate.contentModules.forEach(function(module) { modulesById[module.id] = module; });
    candidate.contentModules.forEach(function(module) {
        if (module.invalid === true) {
            // 已有无效模块允许在无关事务中保留；本次候选新产生的无效模块必须拒绝。
            if (!baselineInvalidIds[module.id]) throw new Error(t('content_module_invalid'));
            return;
        }
        validateContentModule(module, { modulesById: modulesById });
    });
    var baseline = options.baseline || getContentModuleSnapshot();
    function check() {
        if (state.settings !== root) throw new Error(t('content_module_settings_replaced'));
        if (getContentModuleSnapshot() !== baseline) throw new Error(t('content_module_settings_changed'));
    }
    try {
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: check,
            transformSnapshot: function(snapshot) {
                snapshot.settings.contentModules = JSON.parse(JSON.stringify(candidate.contentModules));
                snapshot.settings.contentModuleBindings = JSON.parse(JSON.stringify(candidate.contentModuleBindings));
                snapshot.settings.contentModuleConversationDisabled = JSON.parse(JSON.stringify(candidate.contentModuleConversationDisabled));
                snapshot.settings.contentModuleGrants = JSON.parse(JSON.stringify(candidate.contentModuleGrants));
                return snapshot;
            },
            onPersistSuccess: function() {
                check();
                state.settings.contentModules = JSON.parse(JSON.stringify(candidate.contentModules));
                state.settings.contentModuleBindings = JSON.parse(JSON.stringify(candidate.contentModuleBindings));
                state.settings.contentModuleConversationDisabled = JSON.parse(JSON.stringify(candidate.contentModuleConversationDisabled));
                state.settings.contentModuleGrants = JSON.parse(JSON.stringify(candidate.contentModuleGrants));
            },
            commitPendingSnapshot: function(snapshot) {
                if (getContentModuleSnapshot() === baseline) {
                    snapshot.settings.contentModules = JSON.parse(JSON.stringify(candidate.contentModules));
                    snapshot.settings.contentModuleBindings = JSON.parse(JSON.stringify(candidate.contentModuleBindings));
                    snapshot.settings.contentModuleConversationDisabled = JSON.parse(JSON.stringify(candidate.contentModuleConversationDisabled));
                    snapshot.settings.contentModuleGrants = JSON.parse(JSON.stringify(candidate.contentModuleGrants));
                }
            }
        });
        failedContentModuleDraft = null;
        appStore.notify('settings');
        return true;
    } catch (error) {
        failedContentModuleDraft = { candidate: candidate, root: root, baseline: baseline };
        throw error;
    }
}

async function retryContentModuleChange() {
    var draft = failedContentModuleDraft;
    if (!draft) return false;
    if (state.settings !== draft.root || getContentModuleSnapshot() !== draft.baseline) {
        failedContentModuleDraft = null;
        throw new Error(t('content_module_settings_changed'));
    }
    failedContentModuleDraft = null;
    return saveContentModulesChange(function(candidate) {
        ['contentModules', 'contentModuleBindings', 'contentModuleConversationDisabled', 'contentModuleGrants'].forEach(function(key) {
            candidate[key] = JSON.parse(JSON.stringify(draft.candidate[key]));
        });
    }, { baseline: draft.baseline });
}

function bumpContentModuleRevision(module) {
    module.revision = (Number(module.revision) || 0) + 1;
    return module.revision;
}

function contentModuleSnapshotForRollback(module) {
    return {
        version: module.version,
        revision: module.revision,
        savedAt: Date.now(),
        items: JSON.parse(JSON.stringify(module.items || {})),
        assets: JSON.parse(JSON.stringify(module.assets || [])),
        dependencies: JSON.parse(JSON.stringify(module.dependencies || [])),
        hostQuickReplyRefs: JSON.parse(JSON.stringify(module.hostQuickReplyRefs || []))
    };
}

function cloneContentModuleForCopy(module) {
    var copy = JSON.parse(JSON.stringify(module));
    copy.id = contentModuleNewId('content-module');
    copy.revision = 0;
    copy.version = '1.0.0';
    copy.name = (module.name || t('content_module_unnamed')) + ' ' + t('content_module_copy_suffix');
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    copy.previousVersions = [];
    copy.invalid = undefined;
    copy.order = (state.settings.contentModules || []).length;
    (copy.items.worldBooks || []).forEach(function(book, bookIndex) {
        book.id = 'book-' + bookIndex;
        book.entries.forEach(function(entry, entryIndex) { entry.id = 'entry-' + entryIndex; });
    });
    (copy.items.regexScripts || []).forEach(function(script, index) { script.id = 'regex-' + index; });
    (copy.items.automationRules || []).forEach(function(rule, index) { rule.id = 'rule-' + index; });
    (copy.items.scenePackages || []).forEach(function(scene, index) {
        scene.id = 'scene-' + index;
        scene.events.forEach(function(event, eventIndex) { event.id = 'event-' + eventIndex; });
    });
    return copy;
}

function contentModuleCollectHostQuickReplyRefs(items) {
    var refs = [], seen = Object.create(null);
    ((items && items.automationRules) || []).forEach(function(rule) {
        (rule.actions || []).forEach(function(action) {
            if (!action || action.type !== 'quick-reply') return;
            var key = action.groupId + '\n' + action.buttonId;
            if (seen[key]) return;
            seen[key] = true;
            refs.push({ groupId: action.groupId, buttonId: action.buttonId });
        });
    });
    return refs;
}

function contentModuleFromHost(options) {
    options = options || {};
    var version = String(options.version || '1.0.0');
    if (!contentModuleVersionValid(version)) throw new Error(t('content_module_version_invalid'));
    var items = { worldBooks: [], regexScripts: [], automationRules: [], scenePackages: [] };
    var moduleEntryIds = Object.create(null);
    (options.worldBookIds || []).forEach(function(worldBookId, index) {
        var book = state.worldBooks && state.worldBooks[worldBookId];
        if (!book || !book.entries) return;
        var entries = Object.keys(book.entries).map(function(uid, entryIndex) {
            var raw = JSON.parse(JSON.stringify(book.entries[uid]));
            return contentModuleSanitizeWorldBookEntry(raw, entryIndex, moduleEntryIds);
        }).filter(Boolean);
        items.worldBooks.push({ id: 'book-' + index, name: book.name || worldBookId, entries: entries });
    });
    (options.regexScripts || []).forEach(function(ref, index) {
        var script = null;
        if (ref && ref.layer === 'preset') {
            var preset = state.settings.sillyTavernPreset;
            script = preset && Array.isArray(preset.regexScripts) ? preset.regexScripts[ref.index] : null;
        } else {
            script = state.settings.globalRegexScripts && state.settings.globalRegexScripts[ref.index];
        }
        if (!script) return;
        var normalized = contentModuleSanitizeRegex(script, index, Object.create(null));
        if (normalized) items.regexScripts.push(normalized);
    });
    (options.automationRuleIds || []).forEach(function(ruleId, index) {
        var rule = getAutomationRuleById(ruleId);
        if (!rule) return;
        var normalized = contentModuleSanitizeRule(rule, index, Object.create(null));
        if (normalized) items.automationRules.push(normalized);
        else throw new Error(t('content_module_rule_invalid'));
    });
    (options.scenePackageIds || []).forEach(function(packageId, index) {
        var pkg = getScenePackageById(packageId);
        if (!pkg) return;
        var normalized = contentModuleSanitizeScene(pkg, index, Object.create(null));
        if (normalized) items.scenePackages.push(normalized);
    });
    if (!contentModuleItemCount({ items: items }) && !(options.assets || []).length) throw new Error(t('content_module_empty'));
    var module = {
        id: contentModuleNewId('content-module'),
        formatVersion: CONTENT_MODULE_FORMAT_VERSION,
        version: version,
        name: String(options.name || '').trim().slice(0, CONTENT_MODULE_MAX_NAME) || t('content_module_unnamed'),
        description: String(options.description || '').slice(0, CONTENT_MODULE_MAX_DESCRIPTION),
        source: String(options.source || '').trim().slice(0, CONTENT_MODULE_MAX_SOURCE),
        order: (state.settings.contentModules || []).length,
        revision: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        items: items,
        assets: JSON.parse(JSON.stringify(options.assets || [])),
        dependencies: [],
        hostQuickReplyRefs: contentModuleCollectHostQuickReplyRefs(items),
        previousVersions: []
    };
    return normalizeContentModule(module, module.order, Object.create(null));
}

function contentModuleDiffSummary(previous, next) {
    var summary = [];
    var previousItems = previous && previous.items || {};
    var nextItems = next && next.items || {};
    [
        ['worldBooks', 'content_module_kind_worldbooks'],
        ['regexScripts', 'content_module_kind_regex'],
        ['automationRules', 'content_module_kind_rules'],
        ['scenePackages', 'content_module_kind_scenes']
    ].forEach(function(pair) {
        var kind = pair[0];
        var before = Object.create(null), after = Object.create(null);
        (previousItems[kind] || []).forEach(function(item) { before[item.id] = contentModuleCanonical(item); });
        (nextItems[kind] || []).forEach(function(item) { after[item.id] = contentModuleCanonical(item); });
        var added = Object.keys(after).filter(function(id) { return !before[id]; }).length;
        var removed = Object.keys(before).filter(function(id) { return !after[id]; }).length;
        var changed = Object.keys(after).filter(function(id) { return before[id] && before[id] !== after[id]; }).length;
        summary.push(t(pair[1]) + ' +' + added + ' / -' + removed + ' / ~' + changed);
    });
    var assetBytes = (next && next.assets || []).reduce(function(sum, asset) { return sum + (Number(asset.bytes) || 0); }, 0);
    summary.push(t('content_module_assets_diff').replace('{count}', String((next && next.assets || []).length)).replace('{bytes}', String(assetBytes)));
    return summary;
}

function contentModuleHasHostQuickReplyRefs(module) {
    if (!module || !Array.isArray(module.hostQuickReplyRefs)) return true;
    var groups = (state.settings.quickReplyGroups || []);
    for (var index = 0; index < module.hostQuickReplyRefs.length; index++) {
        var ref = module.hostQuickReplyRefs[index];
        var group = groups.find(function(item) { return item && item.id === ref.groupId; });
        if (!group || !Array.isArray(group.buttons) || !group.buttons.some(function(button) { return button && button.id === ref.buttonId; })) return false;
    }
    return true;
}

function contentModuleHasSendActions(module) {
    return ((module && module.items && module.items.automationRules) || []).some(function(rule) {
        return (rule.actions || []).some(function(action) { return action && action.type === 'send-message'; });
    });
}

async function readContentModulePackage(file) {
    if (!file || typeof file.text !== 'function') throw new Error(t('content_module_import_invalid'));
    if (Number(file.size) > CONTENT_MODULE_MAX_PACKAGE_BYTES) {
        throw new Error(t('content_module_package_too_large').replace('{limit}', contentModuleFormatBytes(CONTENT_MODULE_MAX_PACKAGE_BYTES)));
    }
    var text = await file.text();
    if (typeof text !== 'string') throw new Error(t('content_module_import_invalid'));
    var byteLength = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length;
    if (byteLength > CONTENT_MODULE_MAX_PACKAGE_BYTES) {
        throw new Error(t('content_module_package_too_large').replace('{limit}', contentModuleFormatBytes(CONTENT_MODULE_MAX_PACKAGE_BYTES)));
    }
    return importContentModuleData(JSON.parse(text));
}

function importContentModuleData(raw) {
    if (!contentModulePlainRecord(raw) || !contentModuleOnlyKeys(raw, CONTENT_MODULE_PACKAGE_KEYS) ||
        raw.type !== 'opentavern-content-module' || Number(raw.formatVersion) !== CONTENT_MODULE_FORMAT_VERSION) {
        throw new Error(t('content_module_import_invalid'));
    }
    if (!contentModulePlainRecord(raw.module) || !contentModuleOnlyKeys(raw.module, CONTENT_MODULE_KEYS)) throw new Error(t('content_module_import_invalid'));
    if (raw.module.previousVersions !== undefined) throw new Error(t('content_module_import_invalid'));
    var module = normalizeContentModule(JSON.parse(JSON.stringify(raw.module)), 0, Object.create(null));
    if (!module || module.invalid === true || module.id !== raw.module.id) throw new Error(t('content_module_import_invalid'));
    var modulesById = Object.create(null);
    (state.settings.contentModules || []).forEach(function(item) { modulesById[item.id] = item; });
    var dependencyError = contentModuleDependencyState(module, modulesById, { includeCycle: true });
    if (dependencyError) throw new Error(dependencyError);
    validateContentModule(module, { modulesById: modulesById });
    return module;
}

function exportContentModuleData(module) {
    if (!module) throw new Error(t('content_module_missing'));
    var copy = JSON.parse(JSON.stringify(module));
    delete copy.previousVersions;
    delete copy.invalid;
    return { type: 'opentavern-content-module', formatVersion: CONTENT_MODULE_FORMAT_VERSION, module: copy };
}
