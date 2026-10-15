/**
 * 新手导读（文件：35-state-persistence.js）
 *
 * 负责什么：这是“状态持久化”中的“状态、持久化”部分。
 * 在程序中的位置：它把内存中的应用状态整理成可保存快照，并安排实际写入。
 * 从哪里开始看：主要从 `persistState(immediate, options)`、`getActiveConv(无参数)`、`getCloudSyncConversationSignatureBeforePersist(无参数)`、`shouldScheduleCloudSyncUploadForPersist(snapshot, options, previousSignature)`、`rememberCloudSyncConversationBaseline(snapshot)`、`buildCloudSyncConversationSignature(snapshot)`，以及另外 4 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：要避免高频重复写盘，同时不能漏掉用户刚刚完成的修改。
 */
// ==================== Debounced Persist ====================
var _persistTimeout = null;
var _persistTimeoutRecord = null;
var _cloudSyncConversationSignature = null;
var _persistSnapshotGeneration = 0;
var _persistWriteChain = Promise.resolve();
var _persistPendingRecords = [];
var _persistLatestRecord = null;
const CLOUD_SYNC_CONVERSATION_TRANSIENT_KEYS = {
    _messageCommitInProgress: true,
    _forcedSpeaker: true,
    _historyScrollHandler: true,
    _historyWindow: true,
    _lastRenderedVisibleCount: true,
    _nextGroupSpeaker: true,
    _showAllMessages: true,
    _wiBudgetWarning: true,
    _wiCache: true,
    _wiTimedEffects: true
};

function clonePersistStateSnapshot(snapshot) {
    if (StorageService && typeof StorageService._cloneForPersist === 'function') {
        return StorageService._cloneForPersist(snapshot);
    }
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : snapshot;
}

function registerPersistRecord(record) {
    _persistPendingRecords.push(record);
    _persistLatestRecord = record;
    if (StorageService) StorageService._lastSaveSnapshot = record.snapshot;
}

function removePersistPendingRecord(record) {
    var index = _persistPendingRecords.indexOf(record);
    if (index >= 0) _persistPendingRecords.splice(index, 1);
    if (_persistTimeoutRecord === record) _persistTimeoutRecord = null;
}

function cancelDeferredPersistRecord(record) {
    if (!record || record.status !== 'deferred') return;
    record.status = 'cancelled';
    removePersistPendingRecord(record);
}

function getLatestPendingPersistRecordAfter(generation) {
    var latest = null;
    _persistPendingRecords.forEach(function(record) {
        if (record.generation <= generation || record.status === 'cancelled') return;
        if (!latest || record.generation > latest.generation) latest = record;
    });
    return latest;
}

function restorePersistRuntimeCacheAfterFailure(record) {
    var latestLaterRecord = getLatestPendingPersistRecordAfter(record.generation);
    if (StorageService) {
        StorageService._lastSaveSnapshot = latestLaterRecord
            ? latestLaterRecord.snapshot
            : record.previousCachedSnapshot;
    }
    if (_persistLatestRecord === record) _persistLatestRecord = latestLaterRecord;
    return latestLaterRecord;
}

function rollbackCloudSyncEncryptionDisablePersistRecords(record) {
    var guard = record.cloudSyncEncryptionDisableGuard;
    var restoredEncrypted = state.settings.cloudSyncEncrypted === true;
    var restoredStatus = state.settings.cloudSyncLastStatus;
    var latestCorrectedRecord = null;
    _persistPendingRecords.forEach(function(pendingRecord) {
        if (pendingRecord === record || !pendingRecord.snapshot || !pendingRecord.snapshot.settings) return;
        var pendingGuard = pendingRecord.cloudSyncEncryptionDisableGuard;
        if (!guard || !pendingGuard || pendingGuard.inProgress !== true || pendingGuard.epoch !== guard.epoch) return;
        pendingRecord.snapshot.settings.cloudSyncEncrypted = restoredEncrypted;
        pendingRecord.snapshot.settings.cloudSyncLastStatus = restoredStatus;
        if (!latestCorrectedRecord || pendingRecord.generation > latestCorrectedRecord.generation) {
            latestCorrectedRecord = pendingRecord;
        }
    });
    if (latestCorrectedRecord) {
        if (StorageService) StorageService._lastSaveSnapshot = latestCorrectedRecord.snapshot;
        _persistLatestRecord = latestCorrectedRecord;
        return latestCorrectedRecord;
    }
    restorePersistRuntimeCacheAfterFailure(record);
    return null;
}

function restoreLatestPersistRuntimeCache(record, saveResult) {
    if (!StorageService) return;
    if (saveResult && saveResult.runtimeSnapshot) {
        record.snapshot = clonePersistStateSnapshot(saveResult.runtimeSnapshot);
        if (_persistLatestRecord === record) {
            StorageService._lastSaveSnapshot = record.snapshot;
            return;
        }
    }
    if (_persistLatestRecord && _persistLatestRecord !== record) {
        StorageService._lastSaveSnapshot = _persistLatestRecord.snapshot;
    }
}

function reportPersistPostSaveError(stage, error) {
    try {
        console.warn('[persistState] ' + stage + ' failed:', error);
    } catch (_) {}
}

/**
 * 把当前全局 state 保存到浏览器存储，并在确有会话变化时安排自动云同步。
 *
 * @param {boolean} immediate - true 表示立即加入串行写队列并返回完成 Promise；false 表示等待 450 毫秒，把连续修改合并成一次写入。
 * @param {Object} options - 保存细节，例如保留旧时间戳、跳过自动上传或指定 lastSaved。
 * @returns {Promise<void>} 写入已完成或已成功加入延迟队列时结束的 Promise。
 *
 * 为什么要延迟：用户输入或拖动控件时可能在一秒内触发很多次保存，逐次写盘既慢又磨损资源。
 * 为什么仍保留 immediate：发送消息、导入数据等关键节点需要确保最新状态按顺序尽快落盘。
 * 保存后的状态刷新和云同步调度彼此隔离；它们报错不会把已经成功的本地写入误判为事务失败。
 */
