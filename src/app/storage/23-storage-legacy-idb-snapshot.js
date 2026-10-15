/**
 * 新手导读（文件：23-storage-legacy-idb-snapshot.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、旧版兼容、IndexedDB 数据库、快照”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：主要从 `mapLegacyIDBRecordsById(records)`、`buildLegacyIDBRecoverySnapshot(settings, conversationsRaw, worldBooksRaw, meta)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
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
