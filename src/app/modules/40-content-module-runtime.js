/**
 * 新手导读（文件：40-content-module-runtime.js）
 *
 * 负责什么：只读装配已安装、已绑定且本机已授权的模块内容，向世界书、正则、自动化、场景和 MVU 提供投影。
 * 在程序中的位置：世界书激活、正则装配、C1 事件、C2 场景及 MVU 初始值读取时调用；不修改宿主数组。
 * 从哪里开始看：`getContentModuleAssembly(conv)`、`getContentModuleWorldBookEntries(conv)`、
 * `getContentModuleAutomationRules(conv)`、`getContentModuleScenePackages(conv)`。
 * 修改时注意：每次运行都重新查询真实安装、绑定、内容许可和宿主引用；迟到动作不能沿用已停用的投影。
 */
// ==================== Content Module Runtime Projection ====================
function contentModuleBindingApplies(binding, conv) {
    if (!binding || binding.enabled === false) return false;
    if (binding.scope === 'global') return true;
    if (!conv) return false;
    if (binding.scope === 'conversation') return binding.targetId === conv.id;
    return typeof automationTargetNames === 'function' &&
        automationTargetNames(conv).indexOf(String(binding.targetId || '').toLowerCase()) >= 0;
}

function contentModuleConversationDisabledIds(conv) {
    if (!conv || !conv.id) return [];
    var record = state.settings.contentModuleConversationDisabled || {};
    return Array.isArray(record[conv.id]) ? record[conv.id] : [];
}

function contentModuleHostRefsApply(module, conv) {
    if (!module || !Array.isArray(module.hostQuickReplyRefs)) return true;
    var groups = state.settings.quickReplyGroups || [];
    for (var index = 0; index < module.hostQuickReplyRefs.length; index++) {
        var ref = module.hostQuickReplyRefs[index];
        var group = groups.find(function(item) { return item && item.id === ref.groupId && item.enabled !== false; });
        if (!group) return false;
        if (group.scope === 'conversation' && (!conv || group.targetId !== conv.id)) return false;
        if (group.scope === 'character' &&
            (!conv || typeof automationTargetNames !== 'function' ||
                automationTargetNames(conv).indexOf(String(group.targetId || '').toLowerCase()) < 0)) return false;
        if (!Array.isArray(group.buttons) || !group.buttons.some(function(button) { return button && button.id === ref.buttonId && button.enabled !== false; })) return false;
    }
    return true;
}

function getContentModuleAssembly(conv) {
    ensureContentModuleSettings();
    conv = conv || (typeof getActiveConv === 'function' ? getActiveConv() : null);
    var bindings = getContentModuleBindings();
    var disabledIds = contentModuleConversationDisabledIds(conv);
    var candidates = [], statuses = [];
    getContentModules().forEach(function(module) {
        var applicable = bindings.filter(function(binding) {
            return binding.moduleId === module.id && contentModuleBindingApplies(binding, conv);
        });
        if (module.invalid === true) { statuses.push({ module: module, reason: t('content_module_invalid'), bindings: applicable }); return; }
        if (!applicable.length) { statuses.push({ module: module, reason: t('content_module_status_unbound'), bindings: [] }); return; }
        if (disabledIds.indexOf(module.id) >= 0) { statuses.push({ module: module, reason: t('content_module_status_conversation_disabled'), bindings: applicable }); return; }
        if (!isContentModuleAuthorized(module)) { statuses.push({ module: module, reason: t('content_module_not_authorized'), bindings: applicable }); return; }
        if (!contentModuleHostRefsApply(module, conv)) { statuses.push({ module: module, reason: t('content_module_status_host_ref'), bindings: applicable }); return; }
        candidates.push({ module: module, bindings: applicable });
    });
    var modulesById = Object.create(null);
    getContentModules().forEach(function(module) { modulesById[module.id] = module; });
    var changed = true;
    while (changed) {
        changed = false;
        var effectiveIds = Object.create(null);
        candidates.forEach(function(entry) { effectiveIds[entry.module.id] = true; });
        candidates = candidates.filter(function(entry) {
            var dependencyError = contentModuleDependencyState(entry.module, modulesById, { includeCycle: true });
            if (dependencyError) {
                statuses.push({ module: entry.module, reason: dependencyError, bindings: entry.bindings });
                changed = true;
                return false;
            }
            var missingBinding = entry.module.dependencies.some(function(dependency) { return !effectiveIds[dependency.moduleId]; });
            if (missingBinding) {
                statuses.push({ module: entry.module, reason: t('content_module_status_dependency_unbound'), bindings: entry.bindings });
                changed = true;
                return false;
            }
            return true;
        });
    }
    candidates.sort(function(a, b) {
        return a.module.order - b.module.order || String(a.module.id).localeCompare(String(b.module.id));
    });
    return { conversation: conv, modules: candidates, statuses: statuses };
}

function getContentModuleAssemblyStamp(conv) {
    var assembly = getContentModuleAssembly(conv);
    return JSON.stringify({
        modules: assembly.modules.map(function(entry) {
            return [
                entry.module.id, entry.module.version, contentModuleFingerprint(entry.module),
                entry.bindings.map(function(binding) { return [binding.id, binding.scope, binding.targetId]; })
            ];
        }),
        disabled: contentModuleConversationDisabledIds(assembly.conversation)
    });
}

function getContentModuleEffectiveModules(conv) {
    return getContentModuleAssembly(conv).modules;
}

function contentModuleEntryUid(module, book, entry) {
    return contentModuleNamespaced(module.id, 'wb', book.id, entry.id);
}

function contentModuleFindEntry(module, entryId) {
    var books = module && module.items && module.items.worldBooks || [];
    for (var bookIndex = 0; bookIndex < books.length; bookIndex++) {
        var entries = books[bookIndex].entries || [];
        for (var entryIndex = 0; entryIndex < entries.length; entryIndex++) {
            if (entries[entryIndex].id === entryId) return { book: books[bookIndex], entry: entries[entryIndex] };
        }
    }
    return null;
}

function contentModuleRewriteCondition(condition, module) {
    var copy = JSON.parse(JSON.stringify(condition));
    if (copy.source === 'worldbook-entry' && String(copy.value || '').indexOf(CONTENT_MODULE_ENTRY_REF_PREFIX) === 0) {
        var target = contentModuleFindEntry(module, String(copy.value).slice(CONTENT_MODULE_ENTRY_REF_PREFIX.length));
        if (!target) throw new Error(t('content_module_reference_invalid'));
        copy.value = contentModuleEntryUid(module, target.book, target.entry);
    }
    return copy;
}

function getContentModuleWorldBookEntries(conv) {
    var entries = [];
    getContentModuleEffectiveModules(conv).forEach(function(entry) {
        var module = entry.module;
        (module.items.worldBooks || []).forEach(function(book) {
            (book.entries || []).forEach(function(source) {
                var copy = JSON.parse(JSON.stringify(source));
                copy._sourceWorldBookId = contentModuleNamespaced(module.id, 'wb', book.id);
                copy.uid = contentModuleEntryUid(module, book, source);
                copy._moduleId = module.id;
                copy._moduleVersion = module.version;
                copy._moduleEntryId = source.id;
                if (copy.automationId) copy.automationId = contentModuleNamespaced(module.id, 'automation', copy.automationId);
                copy.id = undefined;
                copy.assetIds = undefined;
                entries.push(copy);
            });
        });
    });
    return entries;
}

function getContentModuleRegexScripts(conv) {
    var scripts = [];
    getContentModuleEffectiveModules(conv).forEach(function(entry) {
        var module = entry.module;
        (module.items.regexScripts || []).forEach(function(script) {
            var copy = JSON.parse(JSON.stringify(script));
            copy._moduleId = module.id;
            copy._moduleVersion = module.version;
            copy._moduleScriptId = script.id;
            scripts.push(copy);
        });
    });
    return scripts;
}

function getContentModuleAutomationRules(conv) {
    var rules = [];
    getContentModuleEffectiveModules(conv).forEach(function(entry) {
        var module = entry.module;
        (module.items.automationRules || []).forEach(function(rule) {
            try {
                var copy = JSON.parse(JSON.stringify(rule));
                copy.id = contentModuleNamespaced(module.id, 'rule', rule.id);
                copy.name = module.name + ' · ' + rule.name;
                copy.enabled = true;
                copy.scope = 'global';
                copy.targetId = '';
                copy.revision = Number(module.revision) || 0;
                copy.conditions = (rule.conditions || []).map(function(condition) { return contentModuleRewriteCondition(condition, module); });
                copy.actions = JSON.parse(JSON.stringify(rule.actions || []));
                copy._contentModuleId = module.id;
                copy._contentModuleVersion = module.version;
                copy._contentModuleRuleId = rule.id;
                rules.push(copy);
            } catch (error) {
                // 引用损坏的投影整体退出；模块内容在安装/更新时已校验，这里只是迟到数据保护。
            }
        });
    });
    return rules;
}

function getContentModuleScenePackages(conv) {
    var packages = [];
    getContentModuleEffectiveModules(conv).forEach(function(entry) {
        var module = entry.module;
        (module.items.scenePackages || []).forEach(function(scene) {
            try {
                var copy = JSON.parse(JSON.stringify(scene));
                copy.id = contentModuleNamespaced(module.id, 'scene', scene.id);
                copy.name = module.name + ' · ' + scene.name;
                copy.enabled = true;
                copy.scope = 'global';
                copy.targetId = '';
                copy.revision = Number(module.revision) || 0;
                copy._contentModuleId = module.id;
                copy._contentModuleVersion = module.version;
                copy._contentModuleSceneId = scene.id;
                copy.events = (scene.events || []).map(function(event) {
                    var eventCopy = JSON.parse(JSON.stringify(event));
                    eventCopy.id = contentModuleNamespaced(module.id, 'scene-event', scene.id, event.id);
                    eventCopy.conditions = (event.conditions || []).map(function(condition) { return contentModuleRewriteCondition(condition, module); });
                    return eventCopy;
                });
                packages.push(copy);
            } catch (error) {
                // 同上：坏引用不会让宿主场景或另一个模块被部分执行。
            }
        });
    });
    return packages;
}

function getContentModuleAutomationRulesForConversation(conv) {
    var host = typeof getAutomationRules === 'function' ? getAutomationRules() : [];
    return host.concat(getContentModuleAutomationRules(conv));
}

function getContentModuleScenePackagesForConversation(conv) {
    var host = typeof getScenePackages === 'function' ? getScenePackages() : [];
    return host.concat(getContentModuleScenePackages(conv));
}

function isContentModuleRuleId(ruleId) {
    var parsed = contentModuleParseNamespaced(ruleId);
    return !!(parsed && parsed.kind === 'rule');
}

function isContentModuleSceneId(packageId) {
    var parsed = contentModuleParseNamespaced(packageId);
    return !!(parsed && parsed.kind === 'scene');
}

function getContentModuleAutomationRuleById(ruleId, conv) {
    if (!isContentModuleRuleId(ruleId)) return null;
    return getContentModuleAutomationRules(conv).find(function(rule) { return rule.id === ruleId; }) || null;
}

function getContentModuleScenePackageById(packageId, conv) {
    if (!isContentModuleSceneId(packageId)) return null;
    return getContentModuleScenePackages(conv).find(function(pkg) { return pkg.id === packageId; }) || null;
}

function getContentModuleAutomationRuleGrant(ruleId) {
    var rule = getContentModuleAutomationRuleById(ruleId, typeof getActiveConv === 'function' ? getActiveConv() : null);
    if (!rule) return null;
    var module = getContentModuleById(rule._contentModuleId);
    if (!module || !isContentModuleAuthorized(module)) return null;
    return {
        revision: rule.revision,
        fingerprint: typeof automationRuleFingerprint === 'function' ? automationRuleFingerprint(rule) : '',
        allowSend: isContentModuleSendAuthorized(module)
    };
}

function getContentModuleSceneGrant(packageId) {
    var pkg = getContentModuleScenePackageById(packageId, typeof getActiveConv === 'function' ? getActiveConv() : null);
    if (!pkg) return null;
    return { revision: pkg.revision, fingerprint: typeof scenePackageFingerprint === 'function' ? scenePackageFingerprint(pkg) : '' };
}

function cancelContentModuleRuntime(moduleId) {
    if (!moduleId) return;
    var prefix = contentModuleNamespaced(moduleId, 'rule', '');
    if (typeof automationPendingSends !== 'undefined' && Array.isArray(automationPendingSends)) {
        automationPendingSends = automationPendingSends.filter(function(item) { return String(item.ruleId || '').indexOf(prefix) !== 0; });
    }
    if (typeof automationScheduledSends !== 'undefined' && Array.isArray(automationScheduledSends)) {
        automationScheduledSends = automationScheduledSends.filter(function(entry) {
            if (String(entry.ruleId || '').indexOf(prefix) !== 0) return true;
            if (entry.timer) clearTimeout(entry.timer);
            return false;
        });
    }
    if (typeof automationPromptFragments !== 'undefined' && automationPromptFragments) {
        Object.keys(automationPromptFragments).forEach(function(conversationId) {
            var pending = automationPromptFragments[conversationId];
            pending.fragments = (pending.fragments || []).filter(function(fragment) { return String(fragment.ruleId || '').indexOf(prefix) !== 0; });
            if (!pending.fragments.length) delete automationPromptFragments[conversationId];
        });
    }
    if (typeof automationWorldbookFragments !== 'undefined' && automationWorldbookFragments) {
        Object.keys(automationWorldbookFragments).forEach(function(conversationId) {
            var worldbook = automationWorldbookFragments[conversationId];
            worldbook.fragments = (worldbook.fragments || []).filter(function(fragment) { return String(fragment.ruleId || '').indexOf(prefix) !== 0; });
        });
    }
}

function getContentModuleStatusText(conv) {
    var assembly = getContentModuleAssembly(conv);
    return assembly.statuses.map(function(entry) {
        return entry.module.name + ' · ' + entry.reason;
    });
}
