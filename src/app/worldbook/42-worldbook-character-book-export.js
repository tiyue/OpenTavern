/**
 * 新手导读（文件：42-worldbook-character-book-export.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、角色、资料库、导出”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `getCharacterBookForExport(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== Character Book Export ====================
function getCharacterBookForExport(conv) {
    if (!conv) return null;

    var combinedEntries = {};
    var names = [];

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (!wb || !wb.entries) return;

            if (wb.name) names.push(wb.name);

            var stFormat = entriesToSTFormat(wb);
            if (stFormat && stFormat.entries) {
                Object.assign(combinedEntries, stFormat.entries);
            }
        });
    }

    if (Object.keys(combinedEntries).length === 0 && conv.worldInfo && conv.worldInfo.entries) {
        var stFormat = entriesToSTFormat(conv.worldInfo);
        if (stFormat && stFormat.entries) {
            Object.assign(combinedEntries, stFormat.entries);
        }
        if (conv.worldInfo.name) names.push(conv.worldInfo.name);
    }

    if (Object.keys(combinedEntries).length === 0) return null;

    var entriesArray = Object.keys(combinedEntries).map(function(uid) {
        return combinedEntries[uid];
    });

    entriesArray.sort(function(a, b) {
        var ia = (a.insertion_order != null ? a.insertion_order : (a.order != null ? a.order : 100));
        var ib = (b.insertion_order != null ? b.insertion_order : (b.order != null ? b.order : 100));
        return ia - ib || (a.id || 0) - (b.id || 0);
    });

    var characterBook = {
        entries: entriesArray
    };

    if (names.length > 0) {
        characterBook.name = names.join(' + ');
    }

    return characterBook;
}
