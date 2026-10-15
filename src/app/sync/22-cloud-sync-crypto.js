/**
 * 新手导读（文件：22-cloud-sync-crypto.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、加密”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Crypto Facade ====================
// Base64, key derivation, encryption, and decryption helpers live in:
// - 22-cloud-sync-base64.js
// - 22-cloud-sync-key-derivation.js
// - 22-cloud-sync-encrypt.js
// - 22-cloud-sync-decrypt.js
