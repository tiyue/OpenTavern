/**
 * 新手导读（文件：34-state-init-normalize.js）
 *
 * 负责什么：这是“应用状态初始化”中的“状态、初始化、规范化”部分。
 * 在程序中的位置：它读取保存的数据、修复旧格式，并保证至少有一个可用会话。
 * 从哪里开始看：主要从 `isSavedStateObjectMap(value)`、`normalizeSavedStateConversationOrder(order, conversations)`、`normalizeSavedStateBoolean(value)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化发生在界面可用之前，异常必须转成安全默认状态而不是中断启动。
 */
// ==================== State Initialization Normalization Helpers ====================
function isSavedStateObjectMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSavedStateConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}

function normalizeSavedStateBoolean(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        var normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === '1';
    }
    return false;
}
