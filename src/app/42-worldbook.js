// ==================== World Info (World Book) Support ====================
// Full SillyTavern-compatible implementation (all documented fields supported in UI + core activation)

function createDefaultWIEntry(uid) {
    uid = uid != null ? uid : Date.now();
    return {
        uid: uid,
        key: [],
        keysecondary: [],
        comment: 'New Entry ' + uid,
        content: '',
        constant: false,
        vectorized: false,
        selective: true,
        selectiveLogic: 0,           // 0=AND ANY, 1=AND ALL, 2=NOT ANY, 3=NOT ALL
        order: 100,
        position: WI_POS.AFTER_CHAR,
        disable: false,
        ignoreBudget: false,
        excludeRecursion: false,
        preventRecursion: false,
        delayUntilRecursion: false,
        probability: 100,
        useProbability: true,
        depth: 4,
        outletName: '',
        group: '',
        groupOverride: false,        // prioritize inclusion
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: false,
        automationId: '',
        role: WI_ROLE.SYSTEM,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        triggers: [],
        // additional matching sources
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        // character filter
        characterFilter: { isExclude: false, names: [], tags: [] },
        // extensions mirror for ST compatibility
        extensions: {
            position: WI_POS.AFTER_CHAR,
            depth: 4,
            role: WI_ROLE.SYSTEM,
            probability: 100,
            useProbability: true,
            outlet_name: '',
            group: '',
            group_override: false,
            group_weight: 100,
            scan_depth: null,
            case_sensitive: null,
            match_whole_words: null,
            use_group_scoring: false,
            automation_id: '',
            vectorized: false,
            sticky: 0, cooldown: 0, delay: 0,
            exclude_recursion: false,
            prevent_recursion: false,
            delay_until_recursion: false,
            match_persona_description: false,
            match_character_description: false,
            match_character_personality: false,
            match_character_depth_prompt: false,
            match_scenario: false,
            match_creator_notes: false,
            triggers: [],
            ignore_budget: false
        }
    };
}

function getWorldInfo(conv) {
    if (!conv) return null;

    // Phase 2 new model: prefer worldBookIds (global reusable world books)
    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        // For now during transition, if using new model, we return a merged view
        // (full implementation of merging multiple books comes later)
        return getMergedWorldInfoForConv(conv);
    }

    // LEGACY fallback: old per-conversation worldInfo
    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    if (!conv.worldInfo.entries) conv.worldInfo.entries = {};
    return conv.worldInfo;
}

// Placeholder for Phase 2: will merge entries from referenced global world books
function getMergedWorldInfoForConv(conv) {
    // During early Phase 2, fall back to legacy if no proper global books yet
    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    return conv.worldInfo;
}

function normalizeImportedWorldInfo(raw) {
    // Accept SillyTavern format { entries: { "0": {...}, ... } } or { worldInfo: ... } or array fallback
    var wi = { name: '', entries: {} };
    if (!raw) return wi;

    var src = raw.entries || (raw.worldInfo && raw.worldInfo.entries) || raw;
    if (Array.isArray(src)) {
        src.forEach(function(e, idx) {
            var entry = normalizeWIEntry(e) || JSON.parse(JSON.stringify(e));
            // uid: support uid / id / index
            var uid = (entry.uid != null) ? entry.uid : (entry.id != null ? entry.id : idx);
            var parsed = parseInt(uid, 10);
            entry.uid = (parsed === 0 || !isNaN(parsed)) ? parsed : Date.now();
            wi.entries[String(entry.uid)] = entry;
        });
    } else if (src && typeof src === 'object') {
        Object.keys(src).forEach(function(k) {
            var entry = normalizeWIEntry(src[k]) || JSON.parse(JSON.stringify(src[k]));
            // Preserve uid 0 correctly (common in SillyTavern exports)
            var uid = (entry.uid != null) ? entry.uid : (entry.id != null ? entry.id : k);
            var parsed = parseInt(uid, 10);
            entry.uid = (parsed === 0 || !isNaN(parsed)) ? parsed : Date.now();
            wi.entries[String(entry.uid)] = entry;
        });
    }
    if (raw.name) wi.name = raw.name;
    return wi;
}

function entriesToSTFormat(worldInfo) {
    // Export in SillyTavern compatible shape
    var out = { entries: {} };
    if (worldInfo && worldInfo.name) out.name = worldInfo.name;
    if (worldInfo && worldInfo.entries) {
        Object.keys(worldInfo.entries).forEach(function(uid) {
            var e = JSON.parse(JSON.stringify(worldInfo.entries[uid]));
            // keep both top-level and extensions in sync (best effort)
            if (!e.extensions) e.extensions = {};
            e.extensions.position = e.position;
            e.extensions.depth = e.depth;
            e.extensions.role = e.role;
            e.extensions.outlet_name = e.outletName;
            e.extensions.group = e.group;
            e.extensions.group_override = e.groupOverride;
            e.extensions.group_weight = e.groupWeight;
            e.extensions.scan_depth = e.scanDepth;
            e.extensions.case_sensitive = e.caseSensitive;
            e.extensions.match_whole_words = e.matchWholeWords;
            e.extensions.use_group_scoring = e.useGroupScoring;
            e.extensions.automation_id = e.automationId;
            e.extensions.sticky = e.sticky;
            e.extensions.cooldown = e.cooldown;
            e.extensions.delay = e.delay;
            e.extensions.exclude_recursion = e.excludeRecursion;
            e.extensions.prevent_recursion = e.preventRecursion;
            e.extensions.delay_until_recursion = e.delayUntilRecursion;
            e.extensions.triggers = e.triggers || [];
            out.entries[String(uid)] = e;
        });
    }
    return out;
}

/**
 * 将当前对话关联的一个或多个世界书转换为 SillyTavern 角色卡内嵌的 character_book 格式
 * 用于导出角色卡时自动嵌入世界书数据
 */
function getCharacterBookForExport(conv) {
    if (!conv) return null;

    var combinedEntries = {};
    var names = [];

    // 优先使用新的全局世界书关联
    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (!wb || !wb.entries) return;

            if (wb.name) names.push(wb.name);

            var stFormat = entriesToSTFormat(wb);
            if (stFormat && stFormat.entries) {
                Object.assign(combinedEntries, stFormat.entries);
            }
        });
    }

    // 向后兼容：如果没有新世界书，尝试使用旧的内嵌 worldInfo
    if (Object.keys(combinedEntries).length === 0 && conv.worldInfo && conv.worldInfo.entries) {
        var stFormat = entriesToSTFormat(conv.worldInfo);
        if (stFormat && stFormat.entries) {
            Object.assign(combinedEntries, stFormat.entries);
        }
        if (conv.worldInfo.name) names.push(conv.worldInfo.name);
    }

    if (Object.keys(combinedEntries).length === 0) return null;

    // 转为 character_book 偏好的数组形式
    var entriesArray = Object.keys(combinedEntries).map(function(uid) {
        return combinedEntries[uid];
    });

    // 按 insertion_order / order 排序 (兼容 normalized 内部格式和原始 ST 格式)
    entriesArray.sort(function(a, b) {
        var ia = (a.insertion_order != null ? a.insertion_order : (a.order != null ? a.order : 100));
        var ib = (b.insertion_order != null ? b.insertion_order : (b.order != null ? b.order : 100));
        return ia - ib || (a.id || 0) - (b.id || 0);
    });

    var characterBook = {
        entries: entriesArray
    };

    if (names.length > 0) {
        characterBook.name = names.join(' + ');
    }

    return characterBook;
}

// In-memory editor state (Phase 2: global world book manager)
var wiState = {
    modalOpen: false,
    currentConvId: null,
    currentWorldBookId: null,      // Currently selected global world book for editing
    viewMode: 'books',             // 'books' | 'entries'  — controls what left panel shows
    selectedUid: null,
    dirty: false,
    primaryKeys: [],
    secondaryKeys: []
};

function updateWIDirtyIndicator() {
    if (!dom.wiDirtyIndicator) return;
    dom.wiDirtyIndicator.classList.toggle('hidden', !wiState.dirty);
}

function getActiveWI() {
    // Phase 2+: prefer the currently selected global world book in the editor
    if (wiState.currentWorldBookId && state.worldBooks && state.worldBooks[wiState.currentWorldBookId]) {
        return state.worldBooks[wiState.currentWorldBookId];
    }
    var conv = getActiveConv();
    return getWorldInfo(conv);
}

// Phase 2: Get or create a global world book by ID
function getWorldBook(wbId) {
    if (!wbId) return null;
    if (!state.worldBooks) state.worldBooks = {};
    if (!state.worldBooks[wbId]) {
        state.worldBooks[wbId] = {
            id: wbId,
            name: 'New World Book',
            entries: {},
            created: Date.now()
        };
    }
    return state.worldBooks[wbId];
}

// Phase 2: Create a brand new global world book
function createNewWorldBook(name) {
    if (!state.worldBooks) state.worldBooks = {};
    const id = 'wb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    state.worldBooks[id] = {
        id: id,
        name: name || 'New World Book',
        entries: {},
        created: Date.now()
    };
    return state.worldBooks[id];
}

// Helper: get all world books currently assigned to a conversation (Phase 2)
function getConversationWorldBooks(conv) {
    if (!conv || !Array.isArray(conv.worldBookIds)) return [];
    return conv.worldBookIds
        .map(id => state.worldBooks && state.worldBooks[id])
        .filter(Boolean);
}

/**
 * 迁移：从现有对话（含群组成员）中收集角色卡，填充到全局 registry
 * - 幂等、安全，不会覆盖已存在的 registry 条目
 * - 不修改任何旧 conv.character（保留历史快照）
 */
function migrateCharactersToRegistry(conversations) {
    if (!state.characters) state.characters = {};

    Object.values(conversations || {}).forEach(conv => {
        // 单角色
        if (conv.character && conv.character.name) {
            const key = conv.character.name.trim().toLowerCase();
            if (!state.characters[key]) {
                state.characters[key] = JSON.parse(JSON.stringify(conv.character));
            }
        }

        // 群组成员
        if (conv.group && Array.isArray(conv.group.members)) {
            conv.group.members.forEach(member => {
                const ch = member && member.character;
                if (ch && ch.name) {
                    const key = ch.name.trim().toLowerCase();
                    if (!state.characters[key]) {
                        state.characters[key] = JSON.parse(JSON.stringify(ch));
                    }
                }
            });
        }
    });
}

// Phase 4: Collect unique characters from the global registry (with legacy fallback)
function getAllAvailableCharacters() {
    const chars = [];
    const seen = new Set();

    // 优先从全局角色库读取（新架构）
    if (state.characters && Object.keys(state.characters).length > 0) {
        Object.values(state.characters).forEach(ch => {
            if (ch && ch.name) {
                const key = ch.name.trim().toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    chars.push(JSON.parse(JSON.stringify(ch)));
                }
            }
        });
    } else {
        // 兜底：从旧对话数据扫描（首次迁移或极端情况）
        Object.values(state.conversations || {}).forEach(conv => {
            if (conv.character && conv.character.name) {
                const key = conv.character.name.trim().toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    chars.push(JSON.parse(JSON.stringify(conv.character)));
                }
            }
        });
    }

    // Sort by name
    chars.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return chars;
}
