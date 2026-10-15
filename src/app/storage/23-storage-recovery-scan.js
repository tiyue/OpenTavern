/**
 * 新手导读（文件：23-storage-recovery-scan.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、恢复、扫描”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：主要从 `scanAllStorageBackends(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
// ==================== Storage Backend Recovery Scanner ====================
async function scanAllStorageBackends() {
    const candidates = [];

    await scanOPFSStorageRecoveryCandidate(candidates);
    await scanIDBStorageRecoveryCandidate(candidates);
    scanLocalStorageCurrentRecoveryCandidate(candidates);
    scanLocalStorageBackupRecoveryCandidates(candidates);
    await scanLegacyIDBStorageRecoveryCandidate(candidates);

    return sortStorageRecoveryCandidates(candidates);
}
