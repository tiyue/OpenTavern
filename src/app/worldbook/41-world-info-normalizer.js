/**
 * 新手导读（文件：41-world-info-normalizer.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“世界书、信息、规范化”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `normalizeWIEntry(raw)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
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
