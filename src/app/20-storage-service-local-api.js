// ==================== StorageService Local Snapshot API ====================
function createStorageServiceLocalSnapshotAPI() {
    return {
        _readLocalSnapshot() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return null;
                const data = JSON.parse(raw);
                return this._isValidSnapshot(data) ? data : null;
            } catch (e) {
                console.warn('[Storage] localStorage snapshot load failed:', e);
                return null;
            }
        },

        _tryWriteLocalSnapshot(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                return true;
            } catch (_) {
                return false;
            }
        },

        _clearMarkerTime() {
            try {
                const n = Number(localStorage.getItem(STORAGE_CLEAR_KEY) || 0);
                return Number.isFinite(n) ? n : 0;
            } catch (_) { return 0; }
        },

        _pickNewest(candidates) {
            const valid = candidates.filter(c => c && this._isValidSnapshot(c.data));
            const withUserData = valid.filter(c => this._hasUserData(c.data));
            return (withUserData.length ? withUserData : valid)
                .sort((a, b) => this._snapshotTime(b.data) - this._snapshotTime(a.data))[0] || null;
        }
    };
}
