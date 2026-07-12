/**
 * 新手导读（文件：42-worldbook-import-format.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、导入、格式”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `normalizeImportedWorldInfo(raw)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== World Book Import Format ====================
function normalizeImportedWorldInfo(raw) {
    var wi = { name: '', entries: {} };
    if (!raw) return wi;

    var src = raw.entries || (raw.worldInfo && raw.worldInfo.entries) || raw;
    if (Array.isArray(src)) {
        src.forEach(function(e, idx) {
            var entry = normalizeWIEntry(e) || JSON.parse(JSON.stringify(e));
            var uid = (entry.uid != null) ? entry.uid : (entry.id != null ? entry.id : idx);
            var parsed = parseInt(uid, 10);
            entry.uid = (parsed === 0 || !isNaN(parsed)) ? parsed : Date.now();
            wi.entries[String(entry.uid)] = entry;
        });
    } else if (src && typeof src === 'object') {
        Object.keys(src).forEach(function(k) {
            var entry = normalizeWIEntry(src[k]) || JSON.parse(JSON.stringify(src[k]));
            var uid = (entry.uid != null) ? entry.uid : (entry.id != null ? entry.id : k);
            var parsed = parseInt(uid, 10);
            entry.uid = (parsed === 0 || !isNaN(parsed)) ? parsed : Date.now();
            wi.entries[String(entry.uid)] = entry;
        });
    }
    if (raw.name) wi.name = raw.name;
    return wi;
}
