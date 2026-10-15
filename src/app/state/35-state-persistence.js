function persistState(immediate, options) {
    options = Object.assign({}, options || {});
    // Capture the transition generation before any asynchronous storage work. A save that
    // started before/during explicit encryption disable must never enqueue plaintext upload
    // after that transaction has already released its in-progress lock.
    const cloudSyncEncryptionDisableGuard = typeof captureCloudSyncEncryptionDisableGuard === 'function'
        ? captureCloudSyncEncryptionDisableGuard()
        : null;
    const previousCachedSnapshot = StorageService && StorageService._lastSaveSnapshot;
    const persistSnapshotGeneration = ++_persistSnapshotGeneration;
    const previousLastSaved = Number(previousCachedSnapshot && previousCachedSnapshot.lastSaved || 0) || 0;
    const requestedLastSaved = Number(options.lastSaved);
    const hasRequestedLastSaved = Number.isFinite(requestedLastSaved) && requestedLastSaved > 0;
    const snapshotLastSaved = hasRequestedLastSaved
        ? requestedLastSaved
        : (options.preserveLastSaved && previousLastSaved ? previousLastSaved : Date.now());
    const conversationsToSave = options.conversationSnapshot
        ? Object.assign(Object.create(null), state.conversations, { [options.conversationSnapshot.id]: options.conversationSnapshot })
        : state.conversations;
    const rawDataToSave = {
        settings: getSafeSettingsForPersist(),
        conversations: conversationsToSave,
        conversationOrder: getPersistableConversationOrder(state.conversationOrder, state.conversations),
        activeConvId: getPersistableActiveConversationId(state.activeConvId, state.conversationOrder, state.conversations),
        worldBooks: state.worldBooks || {},
        characters: state.characters || {},
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: snapshotLastSaved
    };
    const cloudSyncConversationSignatureBeforePersist = getCloudSyncConversationSignatureBeforePersist();
    const capturedSnapshot = clonePersistStateSnapshot(rawDataToSave);
    const record = {
        generation: persistSnapshotGeneration,
        snapshot: typeof options.transformSnapshot === 'function' ? options.transformSnapshot(capturedSnapshot) : capturedSnapshot,
        options: options,
        previousCachedSnapshot: previousCachedSnapshot,
        previousSignature: cloudSyncConversationSignatureBeforePersist,
        cloudSyncEncryptionDisableGuard: cloudSyncEncryptionDisableGuard,
        status: immediate ? 'queued' : 'deferred'
    };
    registerPersistRecord(record);

    const executePersist = async () => {
        let transactionalPersistFailed = false;
        let storageError = null;
        let saveResult = null;
        let storageWriteCompleted = false;
        record.status = 'running';
        try {
            // Saves requested while the disable transaction was pending execute after that
            // transaction in the serialized write queue. Reconcile the two transactional
            // fields with its final success/rollback state before writing their snapshot.
            if (cloudSyncEncryptionDisableGuard && cloudSyncEncryptionDisableGuard.inProgress &&
                !options.cloudSyncEncryptionDisableTransaction && record.snapshot.settings) {
                record.snapshot.settings.cloudSyncEncrypted = state.settings.cloudSyncEncrypted === true;
                record.snapshot.settings.cloudSyncLastStatus = state.settings.cloudSyncLastStatus;
            }
            if (typeof options.beforePersist === 'function') options.beforePersist();
            saveResult = await StorageService.saveAll(record.snapshot, { preserveRuntimeSnapshot: true });
            if (options.throwOnError && saveResult && saveResult.refusedEmpty) throw new Error('Storage refused the requested snapshot.');
            if (saveResult && saveResult.runtimeSnapshot) record.snapshot = clonePersistStateSnapshot(saveResult.runtimeSnapshot);
            storageWriteCompleted = !(saveResult && saveResult.refusedEmpty);
            if (typeof options.onPersistSuccess === 'function') options.onPersistSuccess();
            if (typeof options.commitPendingSnapshot === 'function') {
                _persistPendingRecords.forEach(function(pending) {
                    if (pending.generation > record.generation) options.commitPendingSnapshot(pending.snapshot);
                });
            }
            restoreLatestPersistRuntimeCache(record, saveResult);
        } catch (e) {
            storageError = e;
            if (!StorageService._isQuotaError || !StorageService._isQuotaError(e)) {
                console.error('[persistState] Save error:', e);
            }
            if (options.throwOnError) {
                transactionalPersistFailed = true;
                // Run a caller-supplied rollback before releasing the serialized queue. This
                // lets later writes captured during the transaction reconcile against restored state.
                if (typeof options.onPersistError === 'function') {
                    try {
                        options.onPersistError(e);
                    } catch (rollbackError) {
                        console.error('[persistState] Transaction rollback callback failed:', rollbackError);
                    }
                }
                if (typeof options.rollbackPendingSnapshot === 'function') {
                    _persistPendingRecords.forEach(function(pending) {
                        if (pending.generation > record.generation) options.rollbackPendingSnapshot(pending.snapshot, pending.options);
                    });
                }
                // A late result may already be durable when its origin check fails. Correct it
                // inside this write operation; enqueueing persistState here would deadlock.
                if (storageWriteCompleted && typeof options.beforePersist === 'function') {
                    const rejectedSnapshot = record.snapshot;
                    const correctedSnapshot = clonePersistStateSnapshot({
                        settings: getSafeSettingsForPersist(),
                        conversations: state.conversations,
                        conversationOrder: getPersistableConversationOrder(state.conversationOrder, state.conversations),
                        activeConvId: getPersistableActiveConversationId(state.activeConvId, state.conversationOrder, state.conversations),
                        worldBooks: state.worldBooks || {},
                        characters: state.characters || {},
                        charactersMigrated: !!state._charactersMigrated,
                        lastSaved: Math.max(Date.now(), (Number(rejectedSnapshot.lastSaved) || 0) + 1)
                    });
                    try {
                        const recoveryResult = await StorageService.saveAll(correctedSnapshot, { preserveRuntimeSnapshot: true, rejectedSnapshot: rejectedSnapshot });
                        if (recoveryResult && recoveryResult.refusedEmpty) throw new Error('Storage refused the recovery snapshot.');
                        record.previousCachedSnapshot = recoveryResult && recoveryResult.runtimeSnapshot || correctedSnapshot;
                    } catch (recoveryError) {
                        storageError = new Error((e.message || e) + '; local save recovery failed: ' + (recoveryError.message || recoveryError));
                    }
                    saveResult = null;
                }
                if (options.cloudSyncEncryptionDisableTransaction) {
                    rollbackCloudSyncEncryptionDisablePersistRecords(record);
                } else {
                    restorePersistRuntimeCacheAfterFailure(record);
                }
                throw storageError;
            }
        } finally {
            restoreLatestPersistRuntimeCache(record, saveResult);
            if (typeof updateStorageInfo === 'function') {
                try {
                    updateStorageInfo();
                } catch (error) {
                    reportPersistPostSaveError('storage info refresh', error);
                }
            }
            // A rejected transactional write must not become the cloud-sync baseline or upload.
            if (!transactionalPersistFailed) {
                try {
                    const skipForEncryptionDisable = typeof shouldSuppressCloudSyncAutoUploadForEncryptionDisable === 'function' &&
                        shouldSuppressCloudSyncAutoUploadForEncryptionDisable(cloudSyncEncryptionDisableGuard);
                    const cloudSyncOptions = skipForEncryptionDisable
                        ? Object.assign({}, options, { skipCloudSyncAutoUpload: true })
                        : options;
                    const shouldAutoCloudSync = shouldScheduleCloudSyncUploadForPersist(
                        record.snapshot,
                        cloudSyncOptions,
                        cloudSyncConversationSignatureBeforePersist
                    );
                    if (shouldAutoCloudSync && typeof scheduleCloudSyncUpload === 'function') {
                        scheduleCloudSyncUpload();
                    }
                } catch (error) {
                    reportPersistPostSaveError('cloud sync scheduling', error);
                }
            }
            record.status = storageError ? 'failed' : 'completed';
            removePersistPendingRecord(record);
        }
    };

    const doPersist = () => {
        if (record.status === 'cancelled') return Promise.resolve();
        record.status = 'queued';
        // StorageService has multiple asynchronous backends; serializing writes preserves the
        // caller order so an older encrypted snapshot cannot finish after the committed false one.
        const operation = _persistWriteChain.then(executePersist, executePersist);
        _persistWriteChain = operation.catch(function() {});
        return operation;
    };

    if (immediate) {
        if (_persistTimeout) {
            clearTimeout(_persistTimeout);
            _persistTimeout = null;
            cancelDeferredPersistRecord(_persistTimeoutRecord);
            _persistTimeoutRecord = null;
        }
        return doPersist();
    }

    if (_persistTimeout) {
        clearTimeout(_persistTimeout);
        cancelDeferredPersistRecord(_persistTimeoutRecord);
    }

    _persistTimeoutRecord = record;
    _persistTimeout = setTimeout(function() {
        _persistTimeout = null;
        _persistTimeoutRecord = null;
        doPersist().catch(function(error) {
            reportPersistPostSaveError('deferred write', error);
        });
    }, 450);
    return Promise.resolve();
}
