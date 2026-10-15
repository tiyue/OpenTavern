/**
 * 新手导读（文件：20-storage.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `normalizeUiTheme(theme)`、`cacheUiTheme(theme)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== Storage Engine (简化版：OPFS 主 + localStorage 强快照兜底) ====================
// 目标：去掉复杂的 IndexedDB + 多级 fallback，只保留 OPFS 主 + LS 强快照兜底。
// - OPFS 作为主存储（大容量、高性能）
// - localStorage 作为「强快照」兜底（pagehide 同步刷盘 + 每次 save 尽力写入）
// - 不再使用 IndexedDB，彻底移除 idb 封装和相关复杂度

var STORAGE_KEY = 'opentavern-data-v1';
var STORAGE_CLEAR_KEY = 'opentavern-cleared-at';
var STORAGE_BACKUP_PREFIX = 'opentavern-data-v1-backup-';
var UI_THEME_CACHE_KEY = 'opentavern-ui-theme';

function normalizeUiTheme(theme) {
    return ['new-light', 'new-dark', 'classic', 'system', 'taoxin'].includes(theme) ? theme : 'new-light';
}

function cacheUiTheme(theme) {
    try { localStorage.setItem(UI_THEME_CACHE_KEY, normalizeUiTheme(theme)); } catch (_) {}
}

// ==================== 存储说明（简化后） ====================
// OPFS 是主后端（大容量）。
// localStorage 是强快照兜底（pagehide 同步 + save 时尽力镜像）。
// 加载时 OPFS 优先，失败或无数据则用 LS。
// 保存时优先 OPFS，成功后顺便写 LS；OPFS 跳过时直接写 LS。
// 所有记录带 lastSaved。
