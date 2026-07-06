// ==================== StorageService OPFS Initialization ====================
function resetStorageServiceOPFSState(service) {
    service._opfsReadableAvailable = false;
    service._opfsMirrorAvailable = false;
    service._opfsSkipped = false;
    service._opfsSkippedReason = null;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSSkipped(service, reason) {
    service._opfsSkipped = true;
    service._opfsSkippedReason = reason;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

async function initStorageServiceOPFS(service) {
    try {
        if (!service._useOPFS) {
            markStorageServiceOPFSSkipped(service, 'disabled');
            return;
        }
        if (storageIsFileProtocol()) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        if (!window.isSecureContext) throw new Error('insecure-context');
        if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS not supported');

        await OPFSStorage._getRoot();
        service._opfsReadableAvailable = true;

        if (service._isSafari()) {
            service._opfsFailed = true;
            service._opfsFailureReason = 'Safari OPFS writes are disabled; IndexedDB is canonical.';
            console.warn('[Storage] Safari detected: OPFS will be read for recovery only, not used for writes.');
            return;
        }

        const probe = await OPFSStorage.probeWritable();
        if (probe && probe.ok) {
            service._opfsMirrorAvailable = true;
            console.log('[Storage] OPFS writable mirror initialized successfully');
        } else {
            service._opfsFailed = true;
            service._opfsFailureReason = (probe && probe.reason) || 'OPFS write probe failed';
            console.warn('[Storage] OPFS write probe failed; keeping IndexedDB/localStorage canonical:', service._opfsFailureReason);
        }
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (storageIsFileProtocol() || /file:|file-protocol|blocked on file/i.test(msg)) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        service._opfsFailed = true;
        service._opfsFailureReason = msg;
        console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', msg);
    }
}
