// ==================== Cloud Sync Encryption Upload Interface ====================
// TODO: Add per-item AES-GCM encryption while keeping plaintext hashes stable for reuse.
// Upload encryption deliberately refuses all protocols until the v2 protocol is implemented end to end.
var _cloudSyncEncryptionDisableInProgress = false;
var _cloudSyncEncryptionDisableEpoch = 0;
var _cloudSyncEncryptionDisablePromise = null;

function getCloudSyncEncryptionUploadUnsupportedMessage() {
    return '加密上传功能尚未实现，已阻止本次上传；不会回退旧版同步，也不会上传明文。请关闭“加密上传内容”后重新上传；旧版加密云端快照仍可正常下载。';
}

function getCloudSyncEncryptionDisablePendingMessage() {
    return '正在保存“关闭加密上传”设置，本次上传仍被阻止；保存完成后请重新点击“立即同步”或“立即上传”。';
}

function isCloudSyncEncryptionDisableInProgress() {
    return _cloudSyncEncryptionDisableInProgress === true;
}

function captureCloudSyncEncryptionDisableGuard() {
    return {
        epoch: _cloudSyncEncryptionDisableEpoch,
        inProgress: isCloudSyncEncryptionDisableInProgress()
    };
}

function shouldSuppressCloudSyncAutoUploadForEncryptionDisable(capturedGuard) {
    if (!capturedGuard) return isCloudSyncEncryptionDisableInProgress();
    return capturedGuard.inProgress === true ||
        isCloudSyncEncryptionDisableInProgress() ||
        capturedGuard.epoch !== _cloudSyncEncryptionDisableEpoch;
}

function getCloudSyncV2EncryptionUnsupportedMessage() {
    return getCloudSyncEncryptionUploadUnsupportedMessage();
}

function getCloudSyncEncryptionUploadState() {
    var requested = !!ensureCloudSyncSettings().cloudSyncEncrypted;
    var disabling = isCloudSyncEncryptionDisableInProgress();
    var blocked = requested || disabling;
    return {
        requested: requested,
        supported: false,
        disabling: disabling,
        blocked: blocked,
        canDisable: requested && !disabling,
        code: requested
            ? 'encryption-not-implemented'
            : (disabling ? 'encryption-disable-in-progress' : 'plaintext-upload-enabled'),
        message: requested
            ? getCloudSyncEncryptionUploadUnsupportedMessage()
            : (disabling ? getCloudSyncEncryptionDisablePendingMessage() : '')
    };
}

function createCloudSyncEncryptionUploadUnsupportedError(state) {
    var currentState = state || getCloudSyncEncryptionUploadState();
    var error = new Error(currentState.message || getCloudSyncEncryptionUploadUnsupportedMessage());
    error.code = 'CLOUD_SYNC_ENCRYPTION_NOT_IMPLEMENTED';
    error.cloudSyncEncryptionState = currentState;
    return error;
}

function assertCloudSyncEncryptionUploadAllowed() {
    var encryptionState = getCloudSyncEncryptionUploadState();
    if (encryptionState.blocked) throw createCloudSyncEncryptionUploadUnsupportedError(encryptionState);
    return encryptionState;
}

async function ensureCloudSyncEncryptionUploadAllowed(statusEl, capturedState) {
    var encryptionState = capturedState || getCloudSyncEncryptionUploadState();
    if (!encryptionState.blocked) return encryptionState;
    setCloudSyncStatus(encryptionState.message, true);
    setCloudSyncPendingStatus(statusEl, encryptionState.message);
    try {
        await persistCloudSyncOperationState();
    } catch (error) {
        console.warn('[CloudSync] 持久化加密上传阻断状态失败:', error && error.message);
    }
    throw createCloudSyncEncryptionUploadUnsupportedError(encryptionState);
}

async function performCloudSyncEncryptionDisable(statusEl) {
    var settings = ensureCloudSyncSettings();
    var changed = !!settings.cloudSyncEncrypted;
    var previousEncrypted = settings.cloudSyncEncrypted;
    var previousStatus = settings.cloudSyncLastStatus;
    var cancelledAutoUpload = false;
    _cloudSyncEncryptionDisableEpoch += 1;
    _cloudSyncEncryptionDisableInProgress = true;
    var restorePreviousEncryptionState = function() {
        settings.cloudSyncEncrypted = previousEncrypted;
        settings.cloudSyncLastStatus = previousStatus;
    };
    try {
        if (typeof _cloudSyncUploadTimer !== 'undefined' && _cloudSyncUploadTimer !== null) {
            if (typeof clearTimeout === 'function') clearTimeout(_cloudSyncUploadTimer);
            _cloudSyncUploadTimer = null;
            cancelledAutoUpload = true;
        }
        settings.cloudSyncEncrypted = false;
        var message = changed
            ? '已关闭“加密上传内容”并保存设置；本次未上传任何内容。如需同步，请另行点击“立即同步”或“立即上传”。'
            : '“加密上传内容”已处于关闭状态。';
        settings.cloudSyncLastStatus = message;
        if (statusEl) setCloudSyncPendingStatus(statusEl, message);
        await persistCloudSyncOperationState({
            cloudSyncEncryptionDisableTransaction: true,
            onPersistError: restorePreviousEncryptionState,
            skipCloudSyncAutoUpload: true,
            throwOnError: true
        });
        return {
            success: true,
            changed: changed,
            encryptionEnabled: false,
            cancelledAutoUpload: cancelledAutoUpload,
            uploadStarted: false,
            retryRequired: changed,
            message: message
        };
    } catch (error) {
        restorePreviousEncryptionState();
        throw error;
    } finally {
        _cloudSyncEncryptionDisableInProgress = false;
    }
}

async function disableCloudSyncEncryptionForFutureUploads(statusEl) {
    if (_cloudSyncEncryptionDisablePromise) return _cloudSyncEncryptionDisablePromise;
    var operation = performCloudSyncEncryptionDisable(statusEl);
    _cloudSyncEncryptionDisablePromise = operation;
    try {
        return await operation;
    } finally {
        if (_cloudSyncEncryptionDisablePromise === operation) {
            _cloudSyncEncryptionDisablePromise = null;
        }
    }
}

async function prepareCloudSyncV2UploadCrypto(remoteManifest) {
    assertCloudSyncEncryptionUploadAllowed();
    if (remoteManifest && remoteManifest.encrypted === true) {
        throw new Error('云端现有数据使用了尚未支持的增量同步加密格式，无法安全覆盖。');
    }
    return { encrypted: false, key: null, crypto: null };
}

async function deriveCloudSyncV2CryptoContext(_cryptoMetadata) {
    throw new Error('此云端数据使用了尚未支持的增量同步加密格式，已停止下载。');
}

async function encryptCloudSyncV2ItemBytes(plaintext, cryptoContext) {
    if (cryptoContext && cryptoContext.encrypted) throw new Error(getCloudSyncV2EncryptionUnsupportedMessage());
    return { bytes: plaintext, iv: null };
}

async function decryptCloudSyncV2ItemBytes(ciphertext, _descriptor, cryptoContext) {
    if (cryptoContext && cryptoContext.encrypted) {
        throw new Error('此云端数据使用了尚未支持的增量同步加密格式，已停止下载。');
    }
    return ciphertext;
}
