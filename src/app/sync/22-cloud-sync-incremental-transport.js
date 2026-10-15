// ==================== Cloud Sync Incremental Transport ====================
var CLOUD_SYNC_V2_MAX_RESPONSE_BYTES = Math.ceil(CLOUD_SYNC_V2_CHUNK_BYTES / 3) * 4 + 65536;

function appendCloudSyncQuery(endpoint, query) {
    var source = String(endpoint || '');
    var hashIndex = source.indexOf('#');
    var hash = hashIndex >= 0 ? source.slice(hashIndex) : '';
    var withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    var queryIndex = withoutHash.indexOf('?');
    var base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    var existing = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1).split('&').filter(Boolean) : [];
    var replacedKeys = {};
    Object.keys(query || {}).forEach(function(key) { replacedKeys[key] = true; });
    existing = existing.filter(function(pair) {
        var rawKey = pair.split('=')[0];
        try { return !replacedKeys[decodeURIComponent(rawKey.replace(/\+/g, ' '))]; }
        catch (_) { return true; }
    });
    var pairs = [];
    Object.keys(query || {}).forEach(function(key) {
        if (query[key] === undefined || query[key] === null) return;
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(query[key])));
    });
    var combined = existing.concat(pairs);
    return base + (combined.length ? '?' + combined.join('&') : '') + hash;
}

async function readCloudSyncV2ResponseText(response) {
    var contentLength = Number(response && response.headers && response.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > CLOUD_SYNC_V2_MAX_RESPONSE_BYTES) {
        throwCloudSyncV2LimitError('单次响应字节数过大');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
        var fallbackText = await response.text();
        if (encodeCloudSyncUtf8(fallbackText).length > CLOUD_SYNC_V2_MAX_RESPONSE_BYTES) {
            throwCloudSyncV2LimitError('单次响应字节数过大');
        }
        return fallbackText;
    }

    var reader = response.body.getReader();
    var chunks = [];
    var totalBytes = 0;
    while (true) {
        var part = await reader.read();
        if (part.done) break;
        var bytes = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value || 0);
        totalBytes += bytes.length;
        if (totalBytes > CLOUD_SYNC_V2_MAX_RESPONSE_BYTES) {
            try { await reader.cancel(); } catch (_) {}
            throwCloudSyncV2LimitError('单次响应字节数过大');
        }
        chunks.push(bytes);
    }
    return decodeCloudSyncUtf8(combineCloudSyncByteChunks(chunks, totalBytes));
}

async function requestCloudSyncV2(method, query, payload) {
    var normalizedMethod = String(method || '').toUpperCase();
    var operation = String(query && query.op || '').toLowerCase();
    if (normalizedMethod === 'POST' && (operation === 'chunk' || operation === 'commit')) {
        assertCloudSyncEncryptionUploadAllowed();
    }
    var settings = ensureCloudSyncSettings();
    var endpoint = getCloudSyncEndpoint();
    if (!endpoint) throw new Error('请填写云同步端点。');
    if (!settings.cloudSyncToken || settings.cloudSyncToken.length < 8) {
        throw new Error('云同步令牌至少需要 8 个字符。');
    }
    var headers = {
        Accept: 'application/json',
        Authorization: 'Bearer ' + settings.cloudSyncToken,
        'X-OpenTavern-Token': settings.cloudSyncToken
    };
    var options = { method: method, headers: headers };
    if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }
    var url = appendCloudSyncQuery(endpoint, Object.assign({ v: 2 }, query || {}));
    var response = await fetch(url, options);
    var text = await readCloudSyncV2ResponseText(response);
    var json = null;
    if (text) {
        try { json = JSON.parse(text); } catch (_) {}
    }
    if (!response.ok || (json && json.success === false)) {
        var error = new Error((json && (json.error || json.message)) || text || ('HTTP ' + response.status));
        error.status = response.status;
        var revision = Number(json && (json.currentRevision !== undefined ? json.currentRevision : json.revision));
        if (Number.isSafeInteger(revision) && revision >= 0) error.currentRevision = revision;
        throw error;
    }
    return json || {};
}

function isCloudSyncV2UnsupportedError(error) {
    return !!error && (error.status === 404 || error.status === 405);
}

async function probeCloudSyncV2Metadata() {
    try {
        var result = await requestCloudSyncV2('GET', { op: 'meta' });
        if (Number(result && result.protocol) !== 2) {
            return { protocol: 1, v2Supported: false, legacyResult: result };
        }
        var exists = !!result.exists;
        var manifestChunks = result.manifestChunks === undefined ? 0 : Number(result.manifestChunks);
        var manifestBytes = result.manifestBytes === undefined ? 0 : Number(result.manifestBytes);
        var revision = result.revision === undefined ? 0 : Number(result.revision);
        var updatedAt = result.updatedAt === undefined ? 0 : Number(result.updatedAt);
        var lastSaved = result.lastSaved === undefined ? 0 : Number(result.lastSaved);
        if (!Number.isSafeInteger(manifestChunks) || manifestChunks < 0 ||
            !Number.isSafeInteger(manifestBytes) || manifestBytes < 0 ||
            !Number.isSafeInteger(revision) || revision < 0 ||
            !Number.isSafeInteger(updatedAt) || updatedAt < 0 ||
            !Number.isSafeInteger(lastSaved) || lastSaved < 0 ||
            (exists && (!isCloudSyncSha256Hex(result.manifestHash) || revision < 1))) {
            throw new Error('云端增量同步元数据无效。');
        }
        if (exists) {
            try {
                validateCloudSyncV2TransferReference(manifestBytes, manifestChunks, 'manifest');
            } catch (error) {
                if (error && /安全上限/.test(error.message || '')) throw error;
                throw new Error('云端增量同步元数据无效。');
            }
        }
        return {
            protocol: 2,
            v2Supported: true,
            exists: exists,
            manifestHash: result.manifestHash || '',
            manifestChunks: manifestChunks || 0,
            manifestBytes: manifestBytes || 0,
            revision: revision || 0,
            updatedAt: updatedAt || 0,
            lastSaved: lastSaved || 0
        };
    } catch (error) {
        if (isCloudSyncV2UnsupportedError(error)) return null;
        throw error;
    }
}

async function downloadCloudSyncV2Object(objectHash, chunkCount, expectedBytes, kind) {
    if (!isCloudSyncSha256Hex(objectHash)) {
        throw new Error('云端增量同步对象引用无效。');
    }
    var reference;
    try {
        reference = validateCloudSyncV2TransferReference(expectedBytes, chunkCount, kind || 'object');
    } catch (error) {
        if (error && /安全上限/.test(error.message || '')) throw error;
        throw new Error('云端增量同步对象引用无效。');
    }
    var indexes = [];
    for (var i = 0; i < reference.chunks; i++) indexes.push(i);
    var chunks = await runCloudSyncConcurrent(indexes, async function(index) {
        var result = await requestCloudSyncV2('GET', { op: 'chunk', hash: objectHash, index: index });
        var responseIndex = Number(result.index);
        var responseTotal = Number(result.total);
        if (!Number.isSafeInteger(responseIndex) || !Number.isSafeInteger(responseTotal) ||
            responseIndex !== index || responseTotal !== reference.chunks) {
            throw new Error('云端增量同步分块序号校验失败。');
        }
        if (!isCloudSyncSha256Hex(String(result.chunkHash || '').toLowerCase())) {
            throw new Error('云端增量同步分块哈希格式无效。');
        }
        var expectedChunkBytes = index < reference.chunks - 1
            ? CLOUD_SYNC_V2_CHUNK_BYTES
            : reference.bytes - (reference.chunks - 1) * CLOUD_SYNC_V2_CHUNK_BYTES;
        var encoded = result.data;
        var maxEncodedChars = Math.ceil(expectedChunkBytes / 3) * 4;
        if (typeof encoded !== 'string' || encoded.length > maxEncodedChars) {
            throwCloudSyncV2LimitError('单个分块字节数过大');
        }
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
            throw new Error('云端增量同步分块编码无效。');
        }
        var bytes = base64ToBytes(encoded);
        if (bytes.length !== expectedChunkBytes) {
            throw new Error('云端增量同步分块字节数校验失败。');
        }
        var actualChunkHash = await hashCloudSyncBytes(bytes);
        if (actualChunkHash !== String(result.chunkHash || '').toLowerCase()) {
            throw new Error('云端增量同步分块哈希校验失败。');
        }
        return bytes;
    });
    var combined = combineCloudSyncByteChunks(chunks, reference.bytes);
    if (await hashCloudSyncBytes(combined) !== String(objectHash).toLowerCase()) {
        throw new Error('云端增量同步对象哈希校验失败。');
    }
    return combined;
}

async function uploadCloudSyncV2Object(objectHash, bytes, kind) {
    assertCloudSyncEncryptionUploadAllowed();
    if (!isCloudSyncSha256Hex(objectHash) || !(bytes instanceof Uint8Array) || bytes.length < 1) {
        throw new Error('待上传的增量同步对象无效。');
    }
    var chunks = splitCloudSyncBytes(bytes);
    validateCloudSyncV2TransferReference(bytes.length, chunks.length, kind || 'object');
    var indexes = chunks.map(function(_chunk, index) { return index; });
    await runCloudSyncConcurrent(indexes, async function(index) {
        var chunk = chunks[index];
        await requestCloudSyncV2('POST', { op: 'chunk' }, {
            objectHash: objectHash,
            index: index,
            total: chunks.length,
            data: bytesToBase64(chunk),
            chunkHash: await hashCloudSyncBytes(chunk)
        });
    });
    return { bytes: bytes.length, chunks: chunks.length };
}

async function readCloudSyncV2Manifest(metadata) {
    if (!metadata || !metadata.exists) return null;
    var bytes = await downloadCloudSyncV2Object(
        metadata.manifestHash,
        metadata.manifestChunks,
        metadata.manifestBytes,
        'manifest'
    );
    var manifest = validateCloudSyncV2Manifest(JSON.parse(decodeCloudSyncUtf8(bytes)), metadata.manifestChunks);
    var expectedLastSaved = metadata.v2LastSaved !== undefined ? metadata.v2LastSaved : metadata.lastSaved;
    expectedLastSaved = requireCloudSyncV2SafeInteger(
        expectedLastSaved,
        0,
        '云端增量同步元数据时间戳无效。'
    );
    if (Number(manifest.lastSaved) !== expectedLastSaved) {
        throw new Error('云端增量同步清单时间戳校验失败。');
    }
    return manifest;
}

async function commitCloudSyncV2Manifest(manifest, expectedRevision) {
    assertCloudSyncEncryptionUploadAllowed();
    var revision = expectedRevision === undefined || expectedRevision === null
        ? 0
        : requireCloudSyncV2SafeInteger(expectedRevision, 0, '云端增量同步修订号无效。');
    var prepared = prepareCloudSyncV2ManifestTransfer(manifest);
    var bytes = prepared.bytes;
    var manifestHash = await hashCloudSyncBytes(bytes);
    var uploaded = await uploadCloudSyncV2Object(manifestHash, bytes, 'manifest');
    var result = await requestCloudSyncV2('POST', { op: 'commit' }, {
        expectedRevision: revision,
        manifestHash: manifestHash,
        manifestChunks: uploaded.chunks,
        manifestBytes: uploaded.bytes,
        lastSaved: requireCloudSyncV2SafeInteger(manifest.lastSaved, 0, '云端增量同步清单时间戳无效。')
    });
    result.manifestHash = manifestHash;
    result.manifestChunks = uploaded.chunks;
    result.manifestBytes = uploaded.bytes;
    return result;
}
