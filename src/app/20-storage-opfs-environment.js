// ==================== OPFS Environment Helpers ====================
function getOPFSLocationProtocol() {
    try {
        if (typeof location !== 'undefined' && location && location.protocol) return location.protocol;
        if (typeof window !== 'undefined' && window.location && window.location.protocol) return window.location.protocol;
    } catch (_) {}
    return '';
}

function opfsStorageIsFileProtocol() {
    return getOPFSLocationProtocol() === 'file:';
}

function isKnownOPFSUnsupportedError(e) {
    return !!(e && (
        e.name === 'SecurityError' ||
        /file:|file-protocol|unsafe|OPFS (blocked|unavailable)/i.test(e.message || '')
    ));
}

function warnOPFSUnsupportedOnce(storage) {
    if (opfsStorageIsFileProtocol()) return;
    if (!storage._warnedUnsupported) {
        console.warn('[OPFS] Skipped in this environment; using fallback storage.');
        storage._warnedUnsupported = true;
    }
}

async function getOPFSStorageRoot(storage) {
    if (storage._root) return storage._root;

    if (opfsStorageIsFileProtocol()) {
        throw new Error('OPFS blocked on file:// protocol (open via http://localhost or deploy to HTTPS)');
    }
    if (!window.isSecureContext) {
        throw new Error('OPFS requires secure context (HTTPS or localhost)');
    }
    if (!navigator.storage || !navigator.storage.getDirectory) {
        throw new Error('OPFS not supported in this browser');
    }

    storage._root = await navigator.storage.getDirectory();
    return storage._root;
}

async function probeOPFSStorageWritable(storage) {
    if (storage._probeResult) return storage._probeResult;
    if (storage._probePromise) return storage._probePromise;

    storage._probePromise = (async () => {
        const probeName = '__opentavern-opfs-probe__.json';
        const payload = JSON.stringify({ ok: true, t: Date.now() });
        try {
            const root = await storage._getRoot();
            const fh = await root.getFileHandle(probeName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(payload);
            await writable.close();

            const file = await fh.getFile();
            const text = await file.text();
            if (text !== payload) throw new Error('OPFS probe verification failed');

            try { await root.removeEntry(probeName); } catch (_) {}
            storage._probeResult = { ok: true, reason: null };
            return storage._probeResult;
        } catch (e) {
            storage._probeResult = {
                ok: false,
                reason: e && e.message ? e.message : String(e)
            };
            return storage._probeResult;
        } finally {
            storage._probePromise = null;
        }
    })();

    return storage._probePromise;
}
