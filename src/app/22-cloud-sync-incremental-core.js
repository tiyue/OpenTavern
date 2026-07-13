// ==================== Cloud Sync Incremental Snapshot Core ====================
var CLOUD_SYNC_V2_CHUNK_BYTES = 393216;
var CLOUD_SYNC_V2_CONCURRENCY = 4;

function throwCloudSyncV2LimitError(detail) {
    throw new Error('增量同步数据超出安全上限：' + detail + '。');
}

function requireCloudSyncV2SafeInteger(value, minimum, message) {
    var number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum) {
        throw new Error(message || '云端增量同步整数参数无效。');
    }
    return number;
}

function getCloudSyncV2ChunkCount(byteLength) {
    return Math.ceil(Number(byteLength) / CLOUD_SYNC_V2_CHUNK_BYTES);
}

function validateCloudSyncV2TransferReference(byteLength, chunkCount, kind) {
    var bytes = requireCloudSyncV2SafeInteger(byteLength, 1, '云端增量同步分块引用无效。');
    var chunks = requireCloudSyncV2SafeInteger(chunkCount, 1, '云端增量同步分块引用无效。');
    if (getCloudSyncV2ChunkCount(bytes) !== chunks) {
        throw new Error('云端增量同步分块数量与字节数不一致。');
    }
    return { bytes: bytes, chunks: chunks };
}

function stringifyCloudSyncCanonical(value) {
    return JSON.stringify(value, function(_key, current) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        var sorted = {};
        Object.keys(current).sort().forEach(function(key) {
            sorted[key] = current[key];
        });
        return sorted;
    });
}

function encodeCloudSyncUtf8(text) {
    return new TextEncoder().encode(String(text));
}

function decodeCloudSyncUtf8(bytes) {
    return new TextDecoder().decode(bytes);
}

async function hashCloudSyncBytes(bytes) {
    var cryptoApi = getCloudSyncWebCryptoApi();
    if (!cryptoApi) throw new Error(getCloudSyncWebCryptoUnavailableMessage());
    var digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
    var hex = '';
    for (var i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, '0');
    return hex;
}

function splitCloudSyncBytes(bytes, chunkBytes) {
    if (!(bytes instanceof Uint8Array)) throw new Error('待分块的云端同步数据无效。');
    var size = chunkBytes === undefined
        ? CLOUD_SYNC_V2_CHUNK_BYTES
        : requireCloudSyncV2SafeInteger(chunkBytes, 1, '云端同步分块大小无效。');
    if (size > CLOUD_SYNC_V2_CHUNK_BYTES) throwCloudSyncV2LimitError('单个分块字节数过大');
    var chunks = [];
    for (var offset = 0; offset < bytes.length; offset += size) {
        chunks.push(bytes.slice(offset, Math.min(offset + size, bytes.length)));
    }
    if (!chunks.length) chunks.push(new Uint8Array(0));
    return chunks;
}

function combineCloudSyncByteChunks(chunks, expectedBytes) {
    var length = chunks.reduce(function(total, chunk) {
        return requireCloudSyncV2SafeInteger(total + chunk.length, 0, '云端同步对象总字节数无效。');
    }, 0);
    if (expectedBytes !== undefined && expectedBytes !== null &&
        length !== requireCloudSyncV2SafeInteger(expectedBytes, 0, '云端同步对象字节数校验失败。')) {
        throw new Error('云端同步对象字节数校验失败。');
    }
    var combined = new Uint8Array(length);
    var offset = 0;
    chunks.forEach(function(chunk) {
        combined.set(chunk, offset);
        offset += chunk.length;
    });
    return combined;
}

async function runCloudSyncConcurrent(items, worker, concurrency) {
    var results = new Array(items.length);
    var nextIndex = 0;
    var count = Math.max(1, Math.min(Number(concurrency) || CLOUD_SYNC_V2_CONCURRENCY, items.length || 1));
    async function runWorker() {
        while (nextIndex < items.length) {
            var index = nextIndex++;
            results[index] = await worker(items[index], index);
        }
    }
    var workers = [];
    for (var i = 0; i < count; i++) workers.push(runWorker());
    await Promise.all(workers);
    return results;
}

function splitCloudSyncSnapshotItems(snapshot) {
    var source = snapshot || {};
    var items = {
        settings: source.settings || {},
        conversationOrder: Array.isArray(source.conversationOrder) ? source.conversationOrder : [],
        activeConvId: source.activeConvId === undefined ? null : source.activeConvId,
        charactersMigrated: !!source.charactersMigrated
    };
    var maps = [
        ['conversation:', source.conversations],
        ['character:', source.characters],
        ['worldBook:', source.worldBooks]
    ];
    maps.forEach(function(entry) {
        var map = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
        Object.keys(map).sort().forEach(function(id) {
            items[entry[0] + id] = map[id];
        });
    });
    return items;
}

function rebuildCloudSyncSnapshotFromItems(items, lastSaved) {
    var normalizedLastSaved = Number(lastSaved);
    if (!Number.isSafeInteger(normalizedLastSaved) || normalizedLastSaved < 0) normalizedLastSaved = Date.now();
    var snapshot = {
        settings: {},
        conversations: {},
        conversationOrder: [],
        activeConvId: null,
        worldBooks: {},
        characters: {},
        charactersMigrated: false,
        lastSaved: normalizedLastSaved
    };
    Object.keys(items || {}).forEach(function(itemKey) {
        var value = items[itemKey];
        if (itemKey === 'settings') snapshot.settings = value || {};
        else if (itemKey === 'conversationOrder') snapshot.conversationOrder = Array.isArray(value) ? value : [];
        else if (itemKey === 'activeConvId') snapshot.activeConvId = value === undefined ? null : value;
        else if (itemKey === 'charactersMigrated') snapshot.charactersMigrated = !!value;
        else if (itemKey.indexOf('conversation:') === 0) snapshot.conversations[itemKey.slice(13)] = value;
        else if (itemKey.indexOf('character:') === 0) snapshot.characters[itemKey.slice(10)] = value;
        else if (itemKey.indexOf('worldBook:') === 0) snapshot.worldBooks[itemKey.slice(10)] = value;
    });
    return normalizeCloudSyncSnapshot(snapshot);
}

async function buildCloudSyncIncrementalItemRecords(snapshot) {
    var values = splitCloudSyncSnapshotItems(snapshot);
    var keys = Object.keys(values).sort();
    var records = {};
    await runCloudSyncConcurrent(keys, async function(itemKey) {
        var text = stringifyCloudSyncCanonical(values[itemKey]);
        if (text === undefined) text = 'null';
        var bytes = encodeCloudSyncUtf8(text);
        var chunks = getCloudSyncV2ChunkCount(bytes.length);
        validateCloudSyncV2TransferReference(bytes.length, chunks, 'object');
        records[itemKey] = {
            value: values[itemKey],
            text: text,
            bytes: bytes,
            hash: await hashCloudSyncBytes(bytes)
        };
    });
    return records;
}

function validateCloudSyncV2Manifest(manifest, manifestChunks) {
    if (!manifest || manifest.version !== 2 || manifest.app !== 'OpenTavern') {
        throw new Error('云端增量同步清单格式无效。');
    }
    if (manifest.encrypted === true) {
        throw new Error('此云端数据使用了尚未支持的增量同步加密格式，已停止下载。');
    }
    if (manifest.encrypted !== false || manifest.crypto !== null) {
        throw new Error('云端增量同步清单的加密标记无效。');
    }
    if (!Number.isSafeInteger(Number(manifest.lastSaved)) || Number(manifest.lastSaved) < 0) {
        throw new Error('云端增量同步清单时间戳无效。');
    }
    if (!manifest.items || typeof manifest.items !== 'object' || Array.isArray(manifest.items)) {
        throw new Error('云端增量同步清单缺少对象索引。');
    }
    var itemKeys = Object.keys(manifest.items);
    ['settings', 'conversationOrder', 'activeConvId', 'charactersMigrated'].forEach(function(requiredKey) {
        if (!Object.prototype.hasOwnProperty.call(manifest.items, requiredKey)) {
            throw new Error('云端增量同步清单缺少必要对象：' + requiredKey);
        }
    });
    itemKeys.forEach(function(itemKey) {
        var descriptor = manifest.items[itemKey];
        var validItemKey = itemKey === 'settings' || itemKey === 'conversationOrder' ||
            itemKey === 'activeConvId' || itemKey === 'charactersMigrated' ||
            (itemKey.indexOf('conversation:') === 0 && itemKey.length > 13) ||
            (itemKey.indexOf('character:') === 0 && itemKey.length > 10) ||
            (itemKey.indexOf('worldBook:') === 0 && itemKey.length > 10);
        if (!validItemKey) throw new Error('云端增量同步对象键无效：' + itemKey);
        if (!descriptor || !isCloudSyncSha256Hex(descriptor.hash) || !isCloudSyncSha256Hex(descriptor.objectHash)) {
            throw new Error('云端增量同步对象描述无效：' + itemKey);
        }
        if (descriptor.objectHash !== descriptor.hash) {
            throw new Error('未加密云端同步对象的内容哈希不一致：' + itemKey);
        }
        var reference;
        try {
            reference = validateCloudSyncV2TransferReference(descriptor.bytes, descriptor.chunks, 'object');
        } catch (error) {
            if (error && /安全上限/.test(error.message || '')) throw error;
            throw new Error('云端增量同步对象分块信息无效：' + itemKey);
        }
    });
    return manifest;
}

function prepareCloudSyncV2ManifestTransfer(manifest) {
    validateCloudSyncV2Manifest(manifest);
    var bytes = encodeCloudSyncUtf8(stringifyCloudSyncCanonical(manifest));
    var chunks = getCloudSyncV2ChunkCount(bytes.length);
    validateCloudSyncV2TransferReference(bytes.length, chunks, 'manifest');
    validateCloudSyncV2Manifest(manifest, chunks);
    return { bytes: bytes, chunks: chunks };
}

function isCloudSyncSha256Hex(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function attachCloudSyncV2SnapshotMetadata(snapshot, metadata, stats) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    var revision = Number(metadata && metadata.revision);
    var updatedAt = Number(metadata && metadata.updatedAt);
    var values = {
        __cloudSyncProtocol: 2,
        __cloudSyncRevision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
        __cloudSyncUpdatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
        __cloudSyncV2Stats: stats || null
    };
    Object.keys(values).forEach(function(key) {
        try { Object.defineProperty(snapshot, key, { value: values[key], configurable: true }); }
        catch (_) { snapshot[key] = values[key]; }
    });
    return snapshot;
}
