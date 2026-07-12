/**
 * 新手导读（文件：23-storage-recovery-candidates.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、恢复、候选数据”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：主要从 `createStorageRecoveryCandidate(backend, data)`、`hasRecoverableStorageData(data)`、`sortStorageRecoveryCandidates(candidates)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
// ==================== Storage Recovery Candidates ====================
function createStorageRecoveryCandidate(backend, data) {
    return {
        backend: backend,
        data: data,
        lastSaved: data.lastSaved || 0,
        convCount: Object.keys(data.conversations || {}).length,
        charCount: Object.keys(data.characters || {}).length,
        wbCount: Object.keys(data.worldBooks || {}).length
    };
}

function hasRecoverableStorageData(data) {
    return !!(data && (
        Object.keys(data.conversations || {}).length > 0 ||
        Object.keys(data.characters || {}).length > 0 ||
        Object.keys(data.worldBooks || {}).length > 0 ||
        data.lastSaved ||
        data.settings
    ));
}

function sortStorageRecoveryCandidates(candidates) {
    candidates.forEach(function(candidate) {
        candidate.hasUserData = !!(candidate.convCount || candidate.charCount || candidate.wbCount);
    });
    candidates.sort(function(a, b) {
        return ((b.hasUserData ? 1 : 0) - (a.hasUserData ? 1 : 0)) || ((b.lastSaved || 0) - (a.lastSaved || 0));
    });
    return candidates;
}
