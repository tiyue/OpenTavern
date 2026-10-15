/**
 * 新手导读（文件：23-storage-recovery.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、恢复”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
// ==================== Storage Recovery Public Hooks ====================
window.scanAllStorageBackends = scanAllStorageBackends;
window.restoreFromStorageCandidate = restoreFromStorageCandidate;
