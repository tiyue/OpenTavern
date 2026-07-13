// ==================== Cloud Sync Upload ====================
async function uploadCloudSyncSnapshot(statusEl, options) {
    ensureCloudSyncSettings();
    options = options || {};
    setCloudSyncPendingStatus(statusEl, '正在检查并上传变化对象...');
    var metadata = options.remoteMetadata || null;

    if (!metadata) {
        try {
            metadata = await readCloudSyncRemoteMetadata();
        } catch (err) {
            if (options.force) throw err;
            console.warn('[CloudSync] 云端元数据预检失败，已跳过受保护上传。', err && err.message);
            var verifyMsg = '已跳过云端上传：无法确认云端数据是否为最新。';
            setCloudSyncStatus(verifyMsg, true);
            await persistCloudSyncOperationState();
            return { success: false, skipped: true, reason: 'preflight-failed' };
        }
    }

    disableCloudSyncEncryptionWhenUnavailable(statusEl);
    var encryptedUpload = ensureCloudSyncSettings().cloudSyncEncrypted;
    var useV2 = Number(metadata.protocol) === 2;
    if (useV2 && encryptedUpload) {
        var unsupportedMessage = typeof getCloudSyncV2EncryptionUnsupportedMessage === 'function'
            ? getCloudSyncV2EncryptionUnsupportedMessage()
            : '增量同步暂未支持加密，已阻止本次上传。';
        setCloudSyncStatus(unsupportedMessage, true);
        await persistCloudSyncOperationState();
        throw new Error(unsupportedMessage);
    }
    var comparisonSnapshot = options.force ? null : prepareCloudSyncLocalSnapshotForComparison();
    var remote = getCloudSyncSelectedRemoteSnapshot(metadata);
    if (!options.force) {
        var freshness = remote && getCloudSyncFreshness(remote, comparisonSnapshot);
        if (freshness === 'newer') {
            var skipMsg = '已跳过云端上传：云端数据较新。请先下载，或使用强制上传覆盖。';
            setCloudSyncStatus(skipMsg, true);
            await persistCloudSyncOperationState();
            return { success: false, skipped: true, reason: 'remote-newer' };
        }
    }
    var snapshot = buildAppDataSnapshot({ skipSettingsFormSync: !options.force });

    var result;
    var payload = null;
    try {
        if (useV2) {
            result = await uploadCloudSyncSnapshotV2(snapshot, metadata, {
                expectedRemoteRevision: options.expectedRemoteRevision
            });
        } else {
            var v1Remote = metadata.snapshot;
            var expectedRemoteUpdatedAt;
            if (options.expectedRemoteUpdatedAt !== undefined && options.expectedRemoteUpdatedAt !== null) {
                expectedRemoteUpdatedAt = Number(options.expectedRemoteUpdatedAt);
                if (!Number.isSafeInteger(expectedRemoteUpdatedAt) || expectedRemoteUpdatedAt < 0) {
                    throw new Error('云端同步版本时间戳无效。');
                }
            } else {
                expectedRemoteUpdatedAt = v1Remote ? getCloudSyncRemoteUpdatedAt(v1Remote) : 0;
            }
            payload = await encryptCloudSyncSnapshot(snapshot);
            result = await requestCloudSync('POST', {
                version: 1,
                app: 'OpenTavern',
                updatedAt: snapshot.lastSaved,
                encrypted: payload && payload.encrypted === true,
                data: payload
            }, expectedRemoteUpdatedAt === null ? undefined : { expectedUpdatedAt: expectedRemoteUpdatedAt });
        }
    } catch (err) {
        if (err && (err.status === 409 || err.status === 412)) {
            var conflictMsg = '云端数据刚被另一台设备更新，已停止覆盖。请重新同步后再试。';
            setCloudSyncStatus(conflictMsg, true);
            await persistCloudSyncOperationState();
            throw new Error(conflictMsg);
        }
        throw err;
    }

    var when = formatCloudSyncTimestamp(result.updatedAt);
    var stats = result && result.stats;
    var detail = stats
        ? '（上传 ' + stats.uploadedObjects + ' 个，复用 ' + stats.reusedObjects + ' 个对象）'
        : (payload && payload.encrypted ? '（已加密）' : '');
    setCloudSyncStatus('云端上传完成：' + when + detail, false);
    await persistCloudSyncOperationState();
    return result;
}
