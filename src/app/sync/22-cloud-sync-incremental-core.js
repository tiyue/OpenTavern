// ==================== Cloud Sync Incremental Snapshot Core ====================
var CLOUD_SYNC_V2_CHUNK_BYTES = 393216;
var CLOUD_SYNC_V2_CONCURRENCY = 4;
var CLOUD_SYNC_SHA256_BLOCK_BYTES = 64;
var CLOUD_SYNC_SHA256_BLOCKS_PER_YIELD = 4096;
var CLOUD_SYNC_SHA256_CONSTANTS = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

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
        var sorted = Object.create(null);
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
    if (!(bytes instanceof Uint8Array)) throw new Error('待哈希的云端同步数据无效。');
    var cryptoApi = typeof getCloudSyncWebCryptoApi === 'function'
        ? getCloudSyncWebCryptoApi()
        : null;
    if ((!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== 'function') &&
        typeof crypto !== 'undefined' && crypto && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        cryptoApi = crypto;
    }
    if ((!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== 'function') &&
        typeof window !== 'undefined' && window.crypto && window.crypto.subtle &&
        typeof window.crypto.subtle.digest === 'function') {
        cryptoApi = window.crypto;
    }
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== 'function') {
        return hashCloudSyncBytesWithJavaScript(bytes);
    }
    var digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
    var hex = '';
    for (var i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, '0');
    return hex;
}

function rotateCloudSyncSha256Right(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
}

function yieldCloudSyncSha256Fallback() {
    if (typeof setTimeout === 'function') {
        return new Promise(function(resolve) { setTimeout(resolve, 0); });
    }
    return Promise.resolve();
}

async function hashCloudSyncBytesWithJavaScript(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new Error('待哈希的云端同步数据无效。');
    var state = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    var words = new Uint32Array(64);

    function compress(block, offset) {
        var i;
        for (i = 0; i < 16; i++) {
            var index = offset + i * 4;
            words[i] = (
                (block[index] << 24) |
                (block[index + 1] << 16) |
                (block[index + 2] << 8) |
                block[index + 3]
            ) >>> 0;
        }
        for (i = 16; i < 64; i++) {
            var prior15 = words[i - 15];
            var prior2 = words[i - 2];
            var sigma0 = rotateCloudSyncSha256Right(prior15, 7) ^
                rotateCloudSyncSha256Right(prior15, 18) ^ (prior15 >>> 3);
            var sigma1 = rotateCloudSyncSha256Right(prior2, 17) ^
                rotateCloudSyncSha256Right(prior2, 19) ^ (prior2 >>> 10);
            words[i] = (words[i - 16] + sigma0 + words[i - 7] + sigma1) >>> 0;
        }

        var a = state[0];
        var b = state[1];
        var c = state[2];
        var d = state[3];
        var e = state[4];
        var f = state[5];
        var g = state[6];
        var h = state[7];
        for (i = 0; i < 64; i++) {
            var sum1 = rotateCloudSyncSha256Right(e, 6) ^
                rotateCloudSyncSha256Right(e, 11) ^ rotateCloudSyncSha256Right(e, 25);
            var choose = (e & f) ^ (~e & g);
            var temp1 = (h + sum1 + choose + CLOUD_SYNC_SHA256_CONSTANTS[i] + words[i]) >>> 0;
            var sum0 = rotateCloudSyncSha256Right(a, 2) ^
                rotateCloudSyncSha256Right(a, 13) ^ rotateCloudSyncSha256Right(a, 22);
            var majority = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (sum0 + majority) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }
        state[0] = (state[0] + a) >>> 0;
        state[1] = (state[1] + b) >>> 0;
        state[2] = (state[2] + c) >>> 0;
        state[3] = (state[3] + d) >>> 0;
        state[4] = (state[4] + e) >>> 0;
        state[5] = (state[5] + f) >>> 0;
        state[6] = (state[6] + g) >>> 0;
        state[7] = (state[7] + h) >>> 0;
    }

    var fullBlockBytes = bytes.length - (bytes.length % CLOUD_SYNC_SHA256_BLOCK_BYTES);
    var processedBlocks = 0;
    for (var offset = 0; offset < fullBlockBytes; offset += CLOUD_SYNC_SHA256_BLOCK_BYTES) {
        compress(bytes, offset);
        processedBlocks++;
        if (processedBlocks % CLOUD_SYNC_SHA256_BLOCKS_PER_YIELD === 0) {
            await yieldCloudSyncSha256Fallback();
        }
    }

    var remaining = bytes.length - fullBlockBytes;
    var tailBytes = remaining < 56 ? 64 : 128;
    var tail = new Uint8Array(tailBytes);
    if (remaining) tail.set(bytes.subarray(fullBlockBytes));
    tail[remaining] = 0x80;
    var bitLengthHigh = Math.floor(bytes.length / 0x20000000);
    var bitLengthLow = (bytes.length << 3) >>> 0;
    var lengthOffset = tail.length - 8;
    tail[lengthOffset] = (bitLengthHigh >>> 24) & 0xff;
    tail[lengthOffset + 1] = (bitLengthHigh >>> 16) & 0xff;
    tail[lengthOffset + 2] = (bitLengthHigh >>> 8) & 0xff;
    tail[lengthOffset + 3] = bitLengthHigh & 0xff;
    tail[lengthOffset + 4] = (bitLengthLow >>> 24) & 0xff;
    tail[lengthOffset + 5] = (bitLengthLow >>> 16) & 0xff;
    tail[lengthOffset + 6] = (bitLengthLow >>> 8) & 0xff;
    tail[lengthOffset + 7] = bitLengthLow & 0xff;
    for (var tailOffset = 0; tailOffset < tail.length; tailOffset += CLOUD_SYNC_SHA256_BLOCK_BYTES) {
        compress(tail, tailOffset);
    }

    var hex = '';
    for (var stateIndex = 0; stateIndex < state.length; stateIndex++) {
        hex += state[stateIndex].toString(16).padStart(8, '0');
    }
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
        conversations: Object.create(null),
        conversationOrder: [],
        activeConvId: null,
        worldBooks: Object.create(null),
        characters: Object.create(null),
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
