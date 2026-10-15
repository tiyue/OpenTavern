// Build a restore candidate without changing live state or the parsed backup.
var BACKUP_RESTORE_SECTIONS = [
    ['conversations', '会话'], ['characters', '角色'], ['worldBooks', '世界书'],
    ['settings', '普通设置与用户设定'], ['presets', '预设库'], ['regex', '全局正则']
];
var BACKUP_PRESET_KEYS = ['presetLibrary', 'activePresetId', 'sillyTavernPreset'];
var BACKUP_REGEX_KEYS = ['globalRegexScripts', 'globalRegexEnabled'];

function backupHas(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
function backupRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function backupClone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function backupEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function backupSet(object, key, value) { Object.defineProperty(object, key, { value: value, writable: true, enumerable: true, configurable: true }); }
function backupNewId(used) {
    var id;
    do { id = makeId(); } while (used.has(id));
    used.add(id); return id;
}
function backupOrdinaryKeys(settings) {
    return Object.keys(getCloudSyncPortableSettings(settings)).filter(function(key) {
        return !BACKUP_PRESET_KEYS.includes(key) && !BACKUP_REGEX_KEYS.includes(key) && !['__proto__', 'constructor', 'prototype'].includes(key);
    });
}

function getBackupRestoreAvailability(data) {
    if (!backupRecord(data) || !Array.isArray(data.conversations)) throw new Error('备份中缺少会话数组。');
    var full = data.type === 'opentavern-full-export';
    if (full && ![2, 3].includes(Number(data.version))) throw new Error('仅支持 v2、v3 全量备份。');
    if (!full && !data.conversations.length) throw new Error('备份中没有可恢复的会话。');
    var settings = backupRecord(data.settings) ? data.settings : {};
    return {
        conversations: true,
        characters: full && backupHas(data, 'characters'), worldBooks: full && backupHas(data, 'worldBooks'),
        settings: full && backupHas(data, 'settings'),
        presets: full && BACKUP_PRESET_KEYS.some(function(key) { return backupHas(settings, key); }),
        regex: full && BACKUP_REGEX_KEYS.some(function(key) { return backupHas(settings, key); })
    };
}

function validateBackupMessage(message) {
    if (!backupRecord(message) || !['user', 'assistant', 'system', 'developer', 'tool', 'function'].includes(message.role) || typeof message.content !== 'string') throw new Error('会话中存在非法消息。');
    if (message.responseVersions !== undefined) {
        if (!Array.isArray(message.responseVersions)) throw new Error('回复版本须为数组。');
        message.responseVersions.forEach(function(version) {
            if (!backupRecord(version) || !backupRecord(version.message)) throw new Error('回复版本格式无效。');
            validateBackupMessage(version.message);
            if (version.secondMessages !== undefined) {
                if (!Array.isArray(version.secondMessages)) throw new Error('二阶段版本须为数组。');
                version.secondMessages.forEach(validateBackupMessage);
            }
        });
    }
}

function validateBackupOrdinarySettings(settings) {
    var defaults = defaultSettings();
    backupOrdinaryKeys(settings).forEach(function(key) {
        if (!backupHas(defaults, key) || ['userPersonas', 'activeUserPersonaId', 'userName', 'userDescription'].includes(key)) return;
        var value = settings[key], expected = defaults[key];
        if (expected !== null && typeof value !== typeof expected || typeof expected === 'number' && !Number.isFinite(value) || Array.isArray(expected) && !Array.isArray(value)) throw new Error('设置格式无效：' + key);
    });
    var ranges = { temperature: [0, 2], topP: [0, 1], frequencyPenalty: [-2, 2], presencePenalty: [-2, 2], twoStageTemperature: [0, 2], twoStageTopP: [0, 1], summaryTemperature: [0, 2], contextLength: [1, Infinity], maxTokens: [1, Infinity], summaryThreshold: [1, 100], summaryMaxWords: [0, 10000], worldInfoBudget: [1, Infinity], modelContextCapacity: [0, Infinity] };
    Object.keys(ranges).forEach(function(key) {
        if (backupHas(settings, key) && (settings[key] < ranges[key][0] || settings[key] > ranges[key][1])) throw new Error('设置数值超出范围：' + key);
    });
    if (backupHas(settings, 'uiTheme') && !['new-light', 'new-dark', 'classic', 'system', 'taoxin'].includes(settings.uiTheme)) throw new Error('主题选项无效。');
    if (backupHas(settings, 'readingWidth') && !backupHas(READING_WIDTHS, settings.readingWidth)) throw new Error('阅读宽度无效。');
    if (backupHas(settings, 'readingFontSize') && !READING_FONT_SIZES.includes(settings.readingFontSize)) throw new Error('阅读字号无效。');
    if (backupHas(settings, 'chatBackground') && settings.chatBackground && !isSafeChatBackground(settings.chatBackground)) throw new Error('背景须为有效的本地 PNG、JPEG 或 WebP 图片。');
}

function buildBackupRestorePlan(data, selection) {
    var available = getBackupRestoreAvailability(data), incoming = backupClone(data);
    var plan = { selection: {}, counts: {}, conflicts: [], additions: {}, settingsPatch: Object.create(null), dependencies: [], roots: {}, baselineSettings: Object.create(null), beforeActive: state.activeConvId, order: [] };
    BACKUP_RESTORE_SECTIONS.forEach(function(section) {
        var key = section[0]; plan.selection[key] = !!(available[key] && selection[key]); plan.counts[key] = 0;
    });
    ['conversations', 'characters', 'worldBooks'].forEach(function(key) {
        plan.additions[key] = Object.create(null);
        if (plan.selection[key]) plan.roots[key] = state[key];
    });
    if ((plan.selection.settings || plan.selection.presets || plan.selection.regex) && !backupRecord(incoming.settings)) throw new Error('设置须为对象。');
    var current = state.settings || {}, source = backupRecord(incoming.settings) ? incoming.settings : {};
    function patchSetting(key, value) {
        backupSet(plan.settingsPatch, key, backupClone(value));
        backupSet(plan.baselineSettings, key, backupClone(current[key]));
        plan.roots.settings = state.settings;
    }
    function dependency(container, key, value) { plan.dependencies.push({ container: container, key: key, value: backupClone(value) }); }
    var personaMap = Object.create(null), worldMap = Object.create(null);
    if (plan.selection.settings) {
        if (!backupRecord(source)) throw new Error('普通设置须为对象。');
        validateBackupOrdinarySettings(source);
        var local = getCloudSyncPreservedLocalSettings(current);
        preserveCloudSyncEndpointForLocalCredential(local, current, 'apiKey', 'apiEndpoint');
        preserveCloudSyncEndpointForLocalCredential(local, current, 'summarizeApiKey', 'summarizeApiEndpoint');
        backupOrdinaryKeys(source).forEach(function(key) {
            if (backupHas(local, key) || ['userPersonas', 'activeUserPersonaId', 'userName', 'userDescription'].includes(key)) return;
            patchSetting(key, source[key]); plan.counts.settings++;
        });
        if (['userPersonas', 'userName', 'userDescription'].some(function(key) { return backupHas(source, key); })) {
            var personas = source.userPersonas;
            if (personas === undefined) personas = [{ id: 'default', name: '默认设定', userName: source.userName || 'User', description: source.userDescription || '' }];
            if (!Array.isArray(personas) || !personas.length) throw new Error('用户设定须为非空数组。');
            var merged = backupClone(current.userPersonas || []), used = new Set(merged.map(function(item) { return item.id; })), seen = new Set();
            personas.forEach(function(persona, index) {
                if (!backupRecord(persona) || ['name', 'userName', 'description'].some(function(key) { return persona[key] !== undefined && typeof persona[key] !== 'string'; })) throw new Error('用户设定格式无效。');
                var normalized = Object.assign(backupClone(persona), normalizeUserPersonaRecord(persona, index, { userName: source.userName, description: source.userDescription }, source));
                var originalId = normalized.id;
                if (seen.has(originalId)) throw new Error('备份包含重复的用户设定 ID。');
                seen.add(originalId);
                var existing = merged.find(function(item) { return item.id === originalId; });
                if (!existing || !backupEqual(existing, normalized)) {
                    if (used.has(originalId)) { normalized.id = backupNewId(used); plan.conflicts.push('用户设定「' + normalized.name + '」将保留为副本。'); }
                    else used.add(originalId);
                    merged.push(normalized);
                }
                backupSet(personaMap, originalId, normalized.id);
            });
            var active = personaMap[source.activeUserPersonaId] || personaMap[personas[0].id || 'default'];
            var chosen = merged.find(function(item) { return item.id === active; });
            patchSetting('userPersonas', merged); patchSetting('activeUserPersonaId', active);
            patchSetting('userName', chosen.userName); patchSetting('userDescription', chosen.description); plan.counts.settings += personas.length;
        }
    }
    if (plan.selection.presets) {
        var library = source.presetLibrary !== undefined ? source.presetLibrary : [source.sillyTavernPreset];
        if (!Array.isArray(library) || !library.length) throw new Error('预设库须为非空数组。');
        var base = backupClone(current); ensurePresetLibrary(base);
        var usedPreset = new Set(base.presetLibrary.map(function(item) { return item.id; })), seenPreset = new Set(), presetMap = Object.create(null);
        library.forEach(function(preset, index) {
            if (!backupRecord(preset) || !Array.isArray(preset.prompts) || !Array.isArray(preset.regexScripts)) throw new Error('预设格式无效。');
            preset.prompts.forEach(function(prompt) { if (!backupRecord(prompt) || typeof prompt.content !== 'string') throw new Error('预设条目格式无效。'); });
            if (preset.promptOrder !== undefined && !Array.isArray(preset.promptOrder)) throw new Error('预设顺序格式无效。');
            preset.regexScripts.forEach(validateRegexScript);
            var originalId = String(preset.id || 'legacy-preset-' + index);
            if (seenPreset.has(originalId)) throw new Error('备份包含重复的预设 ID。');
            seenPreset.add(originalId); preset.id = originalId;
            var existing = base.presetLibrary.find(function(item) { return item.id === originalId; });
            if (!existing || !backupEqual(existing, preset)) {
                if (usedPreset.has(originalId)) { preset.id = backupNewId(usedPreset); plan.conflicts.push('预设「' + String(preset.name || originalId) + '」将保留为副本。'); }
                else usedPreset.add(originalId);
                base.presetLibrary.push(preset);
            }
            backupSet(presetMap, originalId, preset.id);
        });
        base.activePresetId = presetMap[source.activePresetId] || presetMap[String(library[0].id || 'legacy-preset-0')] || library[0].id;
        ensurePresetLibrary(base);
        BACKUP_PRESET_KEYS.forEach(function(key) { patchSetting(key, base[key]); }); plan.counts.presets = library.length;
    }
    if (plan.selection.regex) {
        if (!Array.isArray(source.globalRegexScripts) || source.globalRegexEnabled !== undefined && typeof source.globalRegexEnabled !== 'boolean') throw new Error('全局正则格式无效。');
        source.globalRegexScripts.forEach(validateRegexScript);
        patchSetting('globalRegexScripts', source.globalRegexScripts); patchSetting('globalRegexEnabled', source.globalRegexEnabled === true); plan.counts.regex = source.globalRegexScripts.length;
    }
    if (plan.selection.characters) {
        if (!backupRecord(incoming.characters)) throw new Error('角色库须为对象。');
        var characterMap = Object.create(null), names = new Set(Object.values(state.characters || {}).filter(function(character) { return character && typeof character.name === 'string'; }).map(function(character) { return character.name.trim().toLowerCase(); }));
        Object.keys(incoming.characters).forEach(function(sourceKey) {
            var character = incoming.characters[sourceKey];
            if (!backupRecord(character) || typeof character.name !== 'string' || !character.name.trim()) throw new Error('角色格式无效。');
            if (character.tags !== undefined && (!Array.isArray(character.tags) || character.tags.some(function(tag) { return typeof tag !== 'string'; }))) throw new Error('角色标签须为文本数组。');
            var key = character.name.trim().toLowerCase(); backupSet(characterMap, sourceKey, key);
            if (names.has(key) || backupHas(state.characters, key)) plan.conflicts.push('角色「' + character.name + '」已存在，将保留本机版本。');
            else { backupSet(plan.additions.characters, key, character); names.add(key); plan.counts.characters++; }
        });
        if (plan.selection.settings && Array.isArray(plan.settingsPatch.myCardOrder)) plan.settingsPatch.myCardOrder = plan.settingsPatch.myCardOrder.map(function(key) { return backupHas(characterMap, key) ? characterMap[key] : key; });
        plan.charactersMigrated = incoming.charactersMigrated === true || !!state._charactersMigrated;
    }
    if (plan.selection.worldBooks) {
        if (!backupRecord(incoming.worldBooks)) throw new Error('世界书库须为对象。');
        var usedWorld = new Set(Object.keys(state.worldBooks || {}));
        Object.keys(incoming.worldBooks).forEach(function(key) {
            var book = incoming.worldBooks[key];
            if (!backupRecord(book) || book.entries !== undefined && !backupRecord(book.entries) && !Array.isArray(book.entries)) throw new Error('世界书格式无效。');
            if (book.entries !== undefined && Object.values(book.entries).some(function(entry) { return !backupRecord(entry); })) throw new Error('世界书条目格式无效。');
            var id = key, existing = state.worldBooks && backupHas(state.worldBooks, key) && state.worldBooks[key];
            if (existing && backupEqual(existing, book)) dependency('worldBooks', key, existing);
            else {
                if (usedWorld.has(id)) { id = backupNewId(usedWorld); plan.conflicts.push('世界书「' + String(book.name || key) + '」将保留为副本，并更新导入会话的引用。'); }
                else usedWorld.add(id);
                book.id = id; backupSet(plan.additions.worldBooks, id, book); plan.counts.worldBooks++;
            }
            backupSet(worldMap, key, id);
        });
    }
    if (plan.selection.conversations) {
        var usedConv = new Set(Object.keys(state.conversations || {})), seenConv = new Set(), convMap = Object.create(null);
        incoming.conversations.forEach(function(conv) {
            if (!backupRecord(conv) || !['string', 'number'].includes(typeof conv.id) || !String(conv.id).trim() || !Array.isArray(conv.messages)) throw new Error('会话格式无效。');
            var originalId = String(conv.id);
            if (seenConv.has(originalId)) throw new Error('备份包含重复的会话 ID。');
            seenConv.add(originalId); conv.messages.forEach(validateBackupMessage);
            if (conv.summaries !== undefined && (!Array.isArray(conv.summaries) || conv.summaries.some(function(item) { return !backupRecord(item); }))) throw new Error('摘要格式无效。');
            if (conv.group && (!backupRecord(conv.group) || !Array.isArray(conv.group.members) || conv.group.members.some(function(member) { return !backupRecord(member) || !backupRecord(member.character); }))) throw new Error('群聊成员格式无效。');
            if (conv.worldBookIds !== undefined && (!Array.isArray(conv.worldBookIds) || conv.worldBookIds.some(function(id) { return typeof id !== 'string'; }))) throw new Error('会话世界书引用无效。');
            conv.worldBookIds = (conv.worldBookIds || []).map(function(id) {
                if (backupHas(worldMap, id)) return worldMap[id];
                var localBook = state.worldBooks && backupHas(state.worldBooks, id) && state.worldBooks[id];
                if (!localBook || backupHas(incoming.worldBooks, id) && !backupEqual(incoming.worldBooks[id], localBook)) throw new Error('会话依赖世界书「' + id + '」，请同时选择世界书。');
                dependency('worldBooks', id, localBook); return id;
            });
            if (conv.userPersonaId) {
                if (backupHas(personaMap, conv.userPersonaId)) conv.userPersonaId = personaMap[conv.userPersonaId];
                else {
                    var localPersona = (current.userPersonas || []).find(function(item) { return item.id === conv.userPersonaId; });
                    var remotePersona = (Array.isArray(source.userPersonas) ? source.userPersonas : []).find(function(item) { return item.id === conv.userPersonaId; });
                    if (!localPersona || remotePersona && !backupEqual(localPersona, remotePersona)) throw new Error('会话依赖用户设定，请同时选择普通设置与用户设定。');
                    dependency('settings', 'userPersonas', current.userPersonas);
                }
            }
            conv.id = originalId;
            if (usedConv.has(originalId)) { conv.id = backupNewId(usedConv); plan.conflicts.push('会话「' + String(conv.title || originalId) + '」将保留为副本。'); }
            else usedConv.add(originalId);
            normalizeConversation(conv); backupSet(convMap, originalId, conv.id); backupSet(plan.additions.conversations, conv.id, conv); plan.counts.conversations++;
        });
        if (incoming.conversationOrder !== undefined && (!Array.isArray(incoming.conversationOrder) || incoming.conversationOrder.some(function(id) { return !['string', 'number'].includes(typeof id); }))) throw new Error('会话顺序格式无效。');
        (incoming.conversationOrder || incoming.conversations.map(function(conv) { return conv.id; })).forEach(function(id) {
            var mapped = backupHas(convMap, String(id)) ? convMap[String(id)] : id;
            if (backupHas(plan.additions.conversations, mapped) && !plan.order.includes(mapped)) plan.order.push(mapped);
        });
        Object.keys(plan.additions.conversations).forEach(function(id) { if (!plan.order.includes(id)) plan.order.push(id); });
        plan.activeId = incoming.type === 'opentavern-full-export'
            ? (backupHas(convMap, String(incoming.activeConvId)) ? convMap[String(incoming.activeConvId)] : plan.order[0])
            : (!state.activeConvId ? plan.order[0] : null);
    }
    return plan;
}
