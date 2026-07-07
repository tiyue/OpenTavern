// ==================== OPFS Writable Probe ====================
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
