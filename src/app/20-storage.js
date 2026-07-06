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
    return (theme === 'new-light' || theme === 'new-dark' || theme === 'classic') ? theme : 'new-light';
}

function cacheUiTheme(theme) {
    try { localStorage.setItem(UI_THEME_CACHE_KEY, normalizeUiTheme(theme)); } catch (_) {}
}

// ==================== 存储说明（简化后） ====================
// OPFS 是主后端（大容量）。
// localStorage 是强快照兜底（pagehide 同步 + save 时尽力镜像）。
// 加载时 OPFS 优先，失败或无数据则用 LS。
// 保存时优先 OPFS，成功后顺便写 LS；OPFS 不可用则直接写 LS。
// 所有记录带 lastSaved。
