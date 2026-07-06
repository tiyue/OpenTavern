// ==================== 兼容层（同步 API） ====================
// 历史同步入口，内部已委托给 StorageService（OPFS + LS 兜底）

function loadAll() {
    // 兼容层（同步）：优先读 localStorage 快照（OPFS 是异步主路径）
    // 真正启动加载走 initState 的 await StorageService.loadAll()
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
}

function saveAll(data) {
    // 兼容层：直接委托（StorageService 内部已保证先同步写 LS 强快照）
    try {
        if (StorageService) StorageService._lastSaveSnapshot = data;
        if (StorageService && typeof StorageService.saveAll === 'function') {
            StorageService.saveAll(data).catch(function(e) {
                console.warn('[saveAll compat] async persist failed (pagehide snapshot may recover):', e && e.message);
            });
            return;
        }
    } catch (e) {
        console.warn('[saveAll compat] StorageService path failed, direct LS:', e && e.message);
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}

// Returns a copy of settings with API keys stripped unless user explicitly opted in.
// This prevents accidental persistence of secrets in localStorage.
function getSafeSettingsForPersist() {
    var s = JSON.parse(JSON.stringify(state.settings || {}));
    if (!s.saveApiKey) {
        s.apiKey = '';
        s.summarizeApiKey = '';
    }
    return s;
}

function getSafeSettingsForCloudSync() {
    var s = getSafeSettingsForPersist();
    s.apiKey = '';
    s.summarizeApiKey = '';
    s.cloudSyncToken = '';
    s.cloudSyncPassphrase = '';
    s.cloudSyncLastStatus = '';
    return s;
}

function makeId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

var DEFAULT_TWO_STAGE_PROMPT = [
    '你是一个专门为角色扮演对话生成“下一步行动选项 + 小提示”的结构化助手。',
    '请严格基于刚刚完成的正文回复生成选项。',
    '不要续写正文，不要解释，不要添加前言或结语，只输出以下 XML 结构：',
    '',
    '<options>',
    '  <option>',
    '    <title>2-5字短标题</title>',
    '    <description>25-55字的行动导向描述，可包含亲密元素，但必须符合当前场景与角色性格。优先提供有创意且自然的发展方向。</description>',
    '  </option>',
    '  <!-- 共提供2-4个选项 -->',
    '</options>',
    '',
    '硬性要求：',
    '- 共提供 2-4 个 option。',
    '- title 必须短，description 必须可执行、贴合当前剧情。',
    '- 选项之间应有明显差异，避免机械重复。',
    '- 只输出 XML，不要 Markdown。'
].join('\n');
