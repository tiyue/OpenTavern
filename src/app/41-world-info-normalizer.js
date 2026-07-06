// ==================== World Info Normalizer ====================
function normalizeWIEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var e = JSON.parse(JSON.stringify(raw));

    if (Array.isArray(e.keys) && (!e.key || e.key.length === 0)) {
        e.key = e.keys.slice();
    }
    if (!Array.isArray(e.key)) e.key = [];

    if (Array.isArray(e.secondary_keys) && (!e.keysecondary || e.keysecondary.length === 0)) {
        e.keysecondary = e.secondary_keys.slice();
    }
    if (!Array.isArray(e.keysecondary)) e.keysecondary = [];

    if (e.insertion_order != null && e.order == null) {
        e.order = e.insertion_order;
    }
    if (e.order == null) e.order = 100;

    if (e.enabled != null && e.disable == null) {
        e.disable = !e.enabled;
    }
    if (e.disable == null) e.disable = false;

    e.position = normalizeWorldInfoPositionValue(e.position);
    promoteWorldInfoExtensionFields(e);
    return ensureWorldInfoEntryShape(e);
}
