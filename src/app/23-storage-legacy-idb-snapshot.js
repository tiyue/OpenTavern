// ==================== Legacy IndexedDB Snapshot Builder ====================
function mapLegacyIDBRecordsById(records) {
    const out = {};
    (records || []).forEach(function(record) {
        if (record && record.id) out[record.id] = record;
    });
    return out;
}

function buildLegacyIDBRecoverySnapshot(settings, conversationsRaw, worldBooksRaw, meta) {
    return {
        settings: settings || {},
        conversations: mapLegacyIDBRecordsById(conversationsRaw),
        worldBooks: mapLegacyIDBRecordsById(worldBooksRaw),
        conversationOrder: (meta && meta.conversationOrder) || [],
        activeConvId: (meta && meta.activeConvId) || null,
        characters: (meta && meta.characters) || {},
        charactersMigrated: !!(meta && meta.charactersMigrated),
        lastSaved: (meta && meta.lastSaved) || Date.now(),
        _loadedFrom: 'legacy-idb'
    };
}
