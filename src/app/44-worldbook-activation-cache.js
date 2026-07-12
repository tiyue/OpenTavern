/**
 * 新手导读（文件：44-worldbook-activation-cache.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则、缓存”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `buildWorldInfoActivationCacheKey(conv, wi)`、`cacheActivatedWorldInfoResult(conv, cacheKey, result)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Cache ====================
function buildWorldInfoActivationCacheKey(conv, wi) {
    var messages = conv.messages || [];
    var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    var lastContentHash = lastMsg ? (lastMsg.content || '').slice(0, 64) : '';
    var wiEntryCount = Object.keys(wi.entries).length;

    var fingerprint = '';
    var checkPoints = [0, 1, 2, messages.length - 3, messages.length - 2, messages.length - 1];
    checkPoints.forEach(function(idx) {
        if (idx >= 0 && idx < messages.length) {
            var m = messages[idx];
            fingerprint += (m.role || '') + ':' + (m.content || '').slice(0, 20) + '|';
        }
    });

    return messages.length + '|' + lastContentHash + '|' + wiEntryCount + '|' + fingerprint;
}

function cacheActivatedWorldInfoResult(conv, cacheKey, result) {
    if (!conv) return;
    conv._wiCache = {
        key: cacheKey,
        result: result
    };
}
