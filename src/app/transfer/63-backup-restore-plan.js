// Build a restore candidate without changing live state or the parsed backup.
var BACKUP_RESTORE_SECTIONS = [
    ['conversations', '会话'], ['characters', '角色'], ['worldBooks', '世界书'],
    ['settings', '普通设置与用户设定'], ['presets', '预设库'], ['regex', '全局正则'],
    ['documents', '资料库']
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
        documents: full && backupHas(data, 'documents'),
        settings: full && backupHas(data, 'settings'),
        presets: full && BACKUP_PRESET_KEYS.some(function(key) { return backupHas(settings, key); }),
        regex: full && BACKUP_REGEX_KEYS.some(function(key) { return backupHas(settings, key); })
    };
}

function validateBackupMessage(message) {
    if (typeof validateUserImageAttachments === 'function') validateUserImageAttachments(message);
    if (!backupRecord(message) || !['user', 'assistant', 'system', 'developer', 'tool', 'function'].includes(message.role) || typeof message.content !== 'string') throw new Error('会话中存在非法消息。');
    if (message.toolTrace !== undefined) {
        var normalizedToolTrace = typeof normalizeModelToolTrace === 'function' ? normalizeModelToolTrace(message.toolTrace) : null;
        if (!normalizedToolTrace) throw new Error('工具调用记录格式无效。');
        message.toolTrace = normalizedToolTrace;
    }
    if (message.userVersions !== undefined && (!Array.isArray(message.userVersions) || message.userVersions.some(function(version) {
        return !backupRecord(version) || typeof version.content !== 'string' || version.id !== undefined && (typeof version.id !== 'string' || !version.id);
    }))) throw new Error('用户消息版本格式无效。');
    if (message.selectedUserVersionId !== undefined && typeof message.selectedUserVersionId !== 'string') throw new Error('用户消息版本标识无效。');
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

function validateBackupAutomationRules(value) {
    if (!Array.isArray(value) || value.length > AUTOMATION_MAX_RULES) throw new Error('自动化规则格式无效。');
    var usedIds = Object.create(null);
    return value.map(function(raw, index) {
        if (!backupRecord(raw) || !Array.isArray(raw.conditions) || raw.conditions.length > AUTOMATION_MAX_CONDITIONS ||
            !Array.isArray(raw.actions) || raw.actions.length > AUTOMATION_MAX_ACTIONS) throw new Error('自动化规则格式无效。');
        raw.conditions.forEach(function(condition) {
            if (!backupRecord(condition) || AUTOMATION_CONDITION_SOURCES.indexOf(condition.source) < 0 || AUTOMATION_CONDITION_OPS.indexOf(condition.op) < 0) throw new Error('自动化规则格式无效。');
            if (String(condition.value == null ? '' : condition.value).length > AUTOMATION_MAX_TEXT) throw new Error('自动化规则格式无效。');
        });
        raw.actions.forEach(function(action) {
            if (!backupRecord(action) || AUTOMATION_ACTION_TYPES.indexOf(action.type) < 0) throw new Error('自动化规则格式无效。');
            if (String(action.text || '').length > AUTOMATION_MAX_TEXT || String(action.reason || '').length > AUTOMATION_MAX_RUN_DETAIL) throw new Error('自动化规则格式无效。');
        });
        validateAutomationRule(raw);
        var rule = normalizeAutomationRule(raw, index, usedIds);
        if (!rule) throw new Error('自动化规则格式无效。');
        validateAutomationRule(rule);
        return rule;
    });
}

function validateBackupScenePackages(value) {
    if (!Array.isArray(value) || value.length > SCENE_MAX_PACKAGES) throw new Error('场景包格式无效。');
    var usedIds = Object.create(null);
    return value.map(function(raw, index) {
        if (!scenePlainRecord(raw) || !Array.isArray(raw.events) || raw.events.length > SCENE_MAX_EVENTS) throw new Error('场景包格式无效。');
        raw.events.forEach(function(event) {
            if (!scenePlainRecord(event) || !Array.isArray(event.conditions) || event.conditions.length > SCENE_MAX_CONDITIONS ||
                !Array.isArray(event.mvu) || event.mvu.length > SCENE_MAX_MVU_CHANGES) throw new Error('场景事件格式无效。');
            if (!sceneEventInputValid(event)) throw new Error('场景事件格式无效。');
        });
        if (!scenePackageInputValid(raw)) throw new Error('场景包格式无效。');
        var pkg = normalizeScenePackage(raw, index, usedIds);
        if (!pkg || pkg.invalid === true) throw new Error('场景包格式无效。');
        validateScenePackage(pkg);
        return pkg;
    });
}

function validateBackupContentModules(value) {
    if (!Array.isArray(value) || value.length > CONTENT_MODULE_MAX_MODULES) throw new Error('内容模块格式无效。');
    var usedIds = Object.create(null);
    return value.map(function(raw, index) {
        var id = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
        if (!id || usedIds[id]) throw new Error('内容模块格式无效。');
        var module = normalizeContentModule(JSON.parse(JSON.stringify(raw)), index, usedIds);
        if (!module || module.invalid === true || module.id !== id) throw new Error('内容模块格式无效。');
        validateContentModule(module);
        return module;
    });
}

function validateBackupContentModuleBindings(value, moduleIds) {
    if (!Array.isArray(value) || value.length > CONTENT_MODULE_MAX_MODULES * 4) throw new Error('内容模块绑定格式无效。');
    var usedIds = Object.create(null);
    return value.map(function(raw, index) {
        var binding = normalizeContentModuleBinding(raw, index, usedIds, moduleIds);
        if (!binding) throw new Error('内容模块绑定格式无效。');
        return binding;
    });
}

function validateBackupContentModuleDisabled(value, moduleIds) {
    if (!contentModulePlainRecord(value)) throw new Error('内容模块会话停用记录格式无效。');
    var result = {};
    Object.keys(value).forEach(function(conversationId) {
        var values = value[conversationId];
        if (!Array.isArray(values)) throw new Error('内容模块会话停用记录格式无效。');
        var seen = Object.create(null);
        result[conversationId] = values.map(String).filter(function(moduleId) {
            if (!moduleIds[moduleId] || seen[moduleId]) return false;
            seen[moduleId] = true;
            return true;
        });
    });
    return result;
}

function buildBackupRestorePlan(data, selection) {
    var available = getBackupRestoreAvailability(data), incoming = backupClone(data);
    var plan = { selection: {}, counts: {}, conflicts: [], additions: {}, settingsPatch: Object.create(null), dependencies: [], roots: {}, baselineSettings: Object.create(null), beforeActive: state.activeConvId, order: [] };
    BACKUP_RESTORE_SECTIONS.forEach(function(section) {
        var key = section[0]; plan.selection[key] = !!(available[key] && selection[key]); plan.counts[key] = 0;
    });
    ['conversations', 'characters', 'worldBooks', 'documents'].forEach(function(key) {
        plan.additions[key] = Object.create(null);
        if (plan.selection[key]) plan.roots[key] = state[key];
    });
    if ((plan.selection.settings || plan.selection.presets || plan.selection.regex) && !backupRecord(incoming.settings)) throw new Error('设置须为对象。');
    var current = state.settings || {}, source = backupRecord(incoming.settings) ? getCloudSyncPortableSettings(incoming.settings) : {};
    function patchSetting(key, value) {
        backupSet(plan.settingsPatch, key, backupClone(value));
        backupSet(plan.baselineSettings, key, backupClone(current[key]));
        plan.roots.settings = state.settings;
    }
    function dependency(container, key, value) { plan.dependencies.push({ container: container, key: key, value: backupClone(value) }); }
    var personaMap = Object.create(null), worldMap = Object.create(null), convMap = Object.create(null);
    if (plan.selection.settings) {
        if (!backupRecord(source)) throw new Error('普通设置须为对象。');
        validateBackupOrdinarySettings(source);
        if (backupHas(source, 'automationRules')) source.automationRules = validateBackupAutomationRules(source.automationRules);
        if (backupHas(source, 'scenePackages')) source.scenePackages = validateBackupScenePackages(source.scenePackages);
        if (typeof normalizeContentModule === 'function') {
            if (backupHas(source, 'contentModules')) source.contentModules = validateBackupContentModules(source.contentModules);
            var backupModuleIds = Object.create(null);
            (state.settings.contentModules || []).forEach(function(module) { backupModuleIds[module.id] = true; });
            (source.contentModules || []).forEach(function(module) { backupModuleIds[module.id] = true; });
            if (backupHas(source, 'contentModuleBindings')) {
                source.contentModuleBindings = validateBackupContentModuleBindings(source.contentModuleBindings, backupModuleIds);
            }
            if (backupHas(source, 'contentModuleConversationDisabled')) {
                source.contentModuleConversationDisabled = validateBackupContentModuleDisabled(source.contentModuleConversationDisabled, backupModuleIds);
            }
        }
        if (typeof validateRestoredPluginSettings === 'function') validateRestoredPluginSettings({ settings: source });
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
        if (Array.isArray(plan.settingsPatch.connectionProfiles)) {
            plan.settingsPatch.connectionProfiles.forEach(function(profile) {
                var parameters = profile && profile.parameters;
                if (!backupRecord(parameters)) return;
                var presetId = String(parameters.presetId || '');
                if (backupHas(presetMap, presetId)) parameters.presetId = presetMap[presetId];
            });
        }
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
    if (plan.selection.documents) {
        if (!backupRecord(incoming.documents)) throw new Error('资料库须为对象。');
        var usedDocument = new Set(Object.keys(state.documents || {}));
        Object.keys(incoming.documents).forEach(function(sourceId) {
            var incomingDocument = incoming.documents[sourceId];
            if (!backupRecord(incomingDocument)) throw new Error('资料记录格式无效。');
            var record = normalizeDocumentRecord(incomingDocument, sourceId);
            if (!record) throw new Error('资料记录缺少可读原文。');
            validateDocumentContentLimits(record.content, { enforceTotals: false });
            record.revision = computeDocumentRevision(record.content);
            record.bindings = (record.bindings || []).map(function(binding) {
                if (binding.scope === 'conversation') return binding;
                if (binding.scope === 'character' &&
                    !(state.characters && backupHas(state.characters, binding.targetId)) &&
                    !backupHas(plan.additions.characters, binding.targetId)) return null;
                return binding;
            }).filter(Boolean);
            var existing = state.documents && state.documents[sourceId];
            if (existing && backupEqual(existing, record)) {
                return;
            }
            if (usedDocument.has(record.id) || backupHas(plan.additions.documents, record.id)) {
                record.id = backupNewId(usedDocument);
                plan.conflicts.push('资料「' + String(record.name || sourceId) + '」将保留为副本。');
            }
            usedDocument.add(record.id);
            backupSet(plan.additions.documents, record.id, record);
            plan.counts.documents++;
        });
    }
    if (plan.selection.conversations) {
        var usedConv = new Set(Object.keys(state.conversations || {})), seenConv = new Set();
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
        incoming.conversations.forEach(function(conv) {
            var branch = conv.branchOf;
            if (!backupRecord(branch) || !['string', 'number'].includes(typeof branch.conversationId)) return;
            var parentId = String(branch.conversationId);
            if (backupHas(convMap, parentId)) branch.conversationId = convMap[parentId];
        });
        incoming.conversations.forEach(function(conv) {
            if (!Array.isArray(conv.memorySourceConversationIds)) return;
            var seenMemorySources = Object.create(null);
            conv.memorySourceConversationIds = conv.memorySourceConversationIds.map(function(id) {
                if (typeof id !== 'string' || !id) return null;
                var mapped = backupHas(convMap, id) ? convMap[id] : id;
                if (mapped === conv.id || seenMemorySources[mapped]) return null;
                if (!backupHas(plan.additions.conversations, mapped) &&
                    !(state.conversations && backupHas(state.conversations, mapped))) return null;
                seenMemorySources[mapped] = true;
                return mapped;
            }).filter(Boolean).slice(0, RETRIEVAL_MAX_LINKED_MEMORY_CONVERSATIONS);
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
    if (plan.selection.settings && plan.selection.conversations && Array.isArray(plan.settingsPatch.quickReplyGroups)) {
        plan.settingsPatch.quickReplyGroups = plan.settingsPatch.quickReplyGroups.map(function(group) {
            if (!backupRecord(group) || group.scope !== 'conversation') return group;
            var targetId = group.targetId === undefined || group.targetId === null ? '' : String(group.targetId);
            if (backupHas(convMap, targetId)) group.targetId = convMap[targetId];
            return group;
        });
    }
    if (plan.selection.settings && Array.isArray(plan.settingsPatch.automationRules)) {
        plan.settingsPatch.automationRules = plan.settingsPatch.automationRules.map(function(rule) {
            if (!backupRecord(rule) || rule.scope !== 'conversation') return rule;
            var targetId = rule.targetId === undefined || rule.targetId === null ? '' : String(rule.targetId);
            if (plan.selection.conversations && backupHas(convMap, targetId)) {
                rule.targetId = convMap[targetId];
                return rule;
            }
            rule.enabled = false;
            rule.targetId = ('disabled:' + targetId).slice(0, AUTOMATION_MAX_TARGET);
            plan.conflicts.push('自动化规则「' + String(rule.name || rule.id || '') + '」的会话绑定未随本次恢复导入，已停用，避免关联本机私人会话。');
            return rule;
        });
    }
    if (plan.selection.settings && Array.isArray(plan.settingsPatch.scenePackages)) {
        plan.settingsPatch.scenePackages = plan.settingsPatch.scenePackages.map(function(pkg) {
            if (!backupRecord(pkg) || pkg.scope !== 'conversation') return pkg;
            var targetId = pkg.targetId === undefined || pkg.targetId === null ? '' : String(pkg.targetId);
            if (plan.selection.conversations && backupHas(convMap, targetId)) {
                pkg.targetId = convMap[targetId];
                return pkg;
            }
            pkg.enabled = false;
            pkg.targetId = ('disabled:' + targetId).slice(0, SCENE_MAX_TARGET);
            plan.conflicts.push('场景包「' + String(pkg.name || pkg.id || '') + '」的会话绑定未随本次恢复导入，已停用，避免关联本机私人会话。');
            return pkg;
        });
    }
    if (plan.selection.settings && Array.isArray(plan.settingsPatch.contentModuleBindings)) {
        var moduleTargetLimit = typeof CONTENT_MODULE_MAX_TARGET === 'number' ? CONTENT_MODULE_MAX_TARGET : 200;
        plan.settingsPatch.contentModuleBindings = plan.settingsPatch.contentModuleBindings.map(function(binding) {
            if (!backupRecord(binding) || binding.scope !== 'conversation') return binding;
            var targetId = binding.targetId === undefined || binding.targetId === null ? '' : String(binding.targetId);
            if (plan.selection.conversations && backupHas(convMap, targetId)) {
                binding.targetId = convMap[targetId];
                return binding;
            }
            binding.enabled = false;
            binding.targetId = ('disabled:' + targetId).slice(0, moduleTargetLimit);
            plan.conflicts.push('内容模块绑定的会话未随本次恢复导入，已停用，避免关联本机私人会话。');
            return binding;
        });
    }
    if (plan.selection.settings && backupRecord(plan.settingsPatch.contentModuleConversationDisabled)) {
        var remappedDisabled = {};
        Object.keys(plan.settingsPatch.contentModuleConversationDisabled).forEach(function(conversationId) {
            if (!plan.selection.conversations || !backupHas(convMap, conversationId)) return;
            remappedDisabled[convMap[conversationId]] = plan.settingsPatch.contentModuleConversationDisabled[conversationId];
        });
        plan.settingsPatch.contentModuleConversationDisabled = remappedDisabled;
    }
    if (plan.selection.documents) {
        Object.values(plan.additions.documents).forEach(function(record) {
            record.bindings = (record.bindings || []).map(function(binding) {
                if (binding.scope !== 'conversation') return binding;
                var mapped = backupHas(convMap, binding.targetId) ? convMap[binding.targetId] : binding.targetId;
                if (!state.conversations[mapped] && !backupHas(plan.additions.conversations, mapped)) return null;
                return { scope: binding.scope, targetId: mapped };
            }).filter(Boolean);
        });
        var mergedDocuments = backupClone(state.documents || {});
        Object.keys(plan.additions.documents).forEach(function(id) { backupSet(mergedDocuments, id, plan.additions.documents[id]); });
        var mergedDocumentIds = Object.keys(mergedDocuments);
        if (mergedDocumentIds.length > DOCUMENT_MAX_COUNT) throw new Error(t('document_count_limit'));
        var mergedDocumentChars = mergedDocumentIds.reduce(function(sum, id) {
            return sum + String(mergedDocuments[id] && mergedDocuments[id].content || '').length;
        }, 0);
        if (mergedDocumentChars > DOCUMENT_TOTAL_MAX_CHARS) throw new Error(t('document_total_limit'));
    }
    function resolveImportedWorldBookId(id, strict) {
        if (typeof id !== 'string') throw new Error('世界书引用须为文本。');
        if (backupHas(worldMap, id)) return worldMap[id];
        var localBook = state.worldBooks && backupHas(state.worldBooks, id) && state.worldBooks[id];
        if (!localBook || backupHas(incoming.worldBooks, id) && !backupEqual(incoming.worldBooks[id], localBook)) {
            if (!strict) return null;
            throw new Error('关联依赖世界书「' + id + '」，请同时选择世界书。');
        }
        dependency('worldBooks', id, localBook); return id;
    }
    ['globalWorldBookIds', 'worldBookOrder'].forEach(function(key) {
        if (!backupHas(plan.settingsPatch, key)) return;
        if (!Array.isArray(plan.settingsPatch[key])) throw new Error('世界书关联或顺序须为数组。');
        plan.settingsPatch[key] = Array.from(new Set(plan.settingsPatch[key].map(function(id) { return resolveImportedWorldBookId(id, key === 'globalWorldBookIds'); }).filter(Boolean)));
    });
    function remapCharacterWorldBooks(character) {
        if (!character) return;
        if (character.linkedWorldBookId) character.linkedWorldBookId = resolveImportedWorldBookId(character.linkedWorldBookId, true);
        if (character.linkedExtraWorldBookIds !== undefined) {
            if (!Array.isArray(character.linkedExtraWorldBookIds)) throw new Error('角色额外世界书引用须为数组。');
            character.linkedExtraWorldBookIds = Array.from(new Set(character.linkedExtraWorldBookIds.map(function(id) { return resolveImportedWorldBookId(id, true); })));
        }
    }
    Object.values(plan.additions.characters).forEach(remapCharacterWorldBooks);
    Object.values(plan.additions.conversations).forEach(function(conv) {
        remapCharacterWorldBooks(conv.character);
        if (conv.group) conv.group.members.forEach(function(member) { remapCharacterWorldBooks(member.character); });
    });
    return plan;
}
