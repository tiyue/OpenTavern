// ==================== Cloud Sync Incremental Operations ====================
async function uploadCloudSyncSnapshotV2(snapshot, metadata, options) {
    options = options || {};
    metadata = metadata || { protocol: 2, v2Supported: true, exists: false, revision: 0 };
    var cryptoContext = await prepareCloudSyncV2UploadCrypto(null);
    var expectedRevision = options.expectedRemoteRevision;
    if (expectedRevision === undefined || expectedRevision === null) expectedRevision = metadata.revision || 0;
    expectedRevision = requireCloudSyncV2SafeInteger(expectedRevision, 0, '云端增量同步修订号无效。');
    var remoteManifest = metadata.exists ? await readCloudSyncV2Manifest(metadata) : null;
    if (remoteManifest) validateCloudSyncV2Manifest(remoteManifest, Number(metadata.manifestChunks) || 0);
    var records = await buildCloudSyncIncrementalItemRecords(snapshot);
    var canReuseRemoteObjects = !!remoteManifest && remoteManifest.encrypted === cryptoContext.encrypted;
    var descriptors = {};
    var pendingUploads = [];
    var stats = { uploadedObjects: 0, reusedObjects: 0, totalObjects: Object.keys(records).length };

    var itemKeys = Object.keys(records).sort();
    for (var i = 0; i < itemKeys.length; i++) {
        var itemKey = itemKeys[i];
        var record = records[itemKey];
        var remoteDescriptor = remoteManifest && remoteManifest.items && remoteManifest.items[itemKey];
        if (canReuseRemoteObjects && remoteDescriptor && remoteDescriptor.hash === record.hash) {
            descriptors[itemKey] = Object.assign({}, remoteDescriptor);
            stats.reusedObjects++;
            continue;
        }

        var encoded = await encryptCloudSyncV2ItemBytes(record.bytes, cryptoContext);
        var objectHash = cryptoContext.encrypted ? await hashCloudSyncBytes(encoded.bytes) : record.hash;
        var chunks = getCloudSyncV2ChunkCount(encoded.bytes.length);
        validateCloudSyncV2TransferReference(encoded.bytes.length, chunks, 'object');
        var descriptor = {
            hash: record.hash,
            objectHash: objectHash,
            bytes: encoded.bytes.length,
            chunks: chunks
        };
        if (encoded.iv) descriptor.iv = encoded.iv;
        descriptors[itemKey] = descriptor;
        pendingUploads.push({ objectHash: objectHash, bytes: encoded.bytes });
    }

    var lastSaved = Number(snapshot && snapshot.lastSaved);
    if (!Number.isSafeInteger(lastSaved) || lastSaved < 0) lastSaved = Date.now();
    var manifest = {
        version: 2,
        app: 'OpenTavern',
        lastSaved: lastSaved,
        encrypted: cryptoContext.encrypted,
        crypto: cryptoContext.encrypted ? cryptoContext.crypto : null,
        items: descriptors
    };
    prepareCloudSyncV2ManifestTransfer(manifest);
    for (var uploadIndex = 0; uploadIndex < pendingUploads.length; uploadIndex++) {
        await uploadCloudSyncV2Object(pendingUploads[uploadIndex].objectHash, pendingUploads[uploadIndex].bytes);
        stats.uploadedObjects++;
    }
    var result = await commitCloudSyncV2Manifest(manifest, expectedRevision);
    result.protocol = 2;
    result.incremental = true;
    result.stats = stats;
    var updatedAt = Number(result.updatedAt);
    result.updatedAt = Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : Date.now();
    return result;
}

async function downloadCloudSyncSnapshotV2(metadata) {
    var manifest = await readCloudSyncV2Manifest(metadata);
    if (!manifest) return null;
    var cryptoContext = manifest.encrypted
        ? await deriveCloudSyncV2CryptoContext(manifest.crypto)
        : { encrypted: false, key: null, crypto: null };
    var localSnapshot = prepareCloudSyncLocalSnapshotForComparison();
    var localRecords = await buildCloudSyncIncrementalItemRecords(localSnapshot);
    var values = {};
    var stats = { downloadedObjects: 0, reusedObjects: 0, totalObjects: Object.keys(manifest.items).length };
    var itemKeys = Object.keys(manifest.items).sort();

    for (var i = 0; i < itemKeys.length; i++) {
        var itemKey = itemKeys[i];
        var descriptor = manifest.items[itemKey];
        var localRecord = localRecords[itemKey];
        if (localRecord && localRecord.hash === descriptor.hash) {
            values[itemKey] = localRecord.value;
            stats.reusedObjects++;
            continue;
        }
        var objectBytes = await downloadCloudSyncV2Object(
            descriptor.objectHash,
            descriptor.chunks,
            descriptor.bytes
        );
        var plaintext = await decryptCloudSyncV2ItemBytes(objectBytes, descriptor, cryptoContext);
        if (await hashCloudSyncBytes(plaintext) !== descriptor.hash) {
            throw new Error('云端增量同步明文哈希校验失败：' + itemKey);
        }
        values[itemKey] = JSON.parse(decodeCloudSyncUtf8(plaintext));
        stats.downloadedObjects++;
    }

    var snapshot = rebuildCloudSyncSnapshotFromItems(values, manifest.lastSaved);
    return attachCloudSyncV2SnapshotMetadata(snapshot, metadata, stats);
}
