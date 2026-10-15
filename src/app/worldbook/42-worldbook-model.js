/**
 * 新手导读（文件：42-worldbook-model.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、数据模型”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `getWorldInfo(conv)`、`getMergedWorldInfoForConv(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== World Info Active Model ====================
function getWorldInfo(conv) {
    if (!conv) return null;

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        return getMergedWorldInfoForConv(conv);
    }

    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    if (!conv.worldInfo.entries) conv.worldInfo.entries = {};
    return conv.worldInfo;
}

function getMergedWorldInfoForConv(conv) {
    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    return conv.worldInfo;
}
