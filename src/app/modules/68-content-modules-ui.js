/**
 * 新手导读（文件：68-content-modules-ui.js）
 *
 * 负责什么：内容模块的管理界面——从现有内容新建、导入预览、详情/素材、绑定、各范围启停、
 * 会话停用继承、装配顺序来源、复制、导出、更新差异和回退。
 * 在程序中的位置：入口在设置“扩展”面板；定义/绑定/授权是明确事务，不随普通设置完成/放弃提交。
 * 从哪里开始看：`hydrateContentModuleSettings()`、`openContentModuleManager()`、`openContentModuleCreateDialog()`。
 * 修改时注意：导入不运行、不授权；素材只预览已保存的位图字节，不执行任何模块内容。
 */
// ==================== Content Module UI ====================
function contentModuleScopeLabel(scope) {
    if (scope === 'character') return t('automation_scope_character');
    if (scope === 'conversation') return t('automation_scope_conversation');
    return t('automation_scope_global');
}

function contentModuleBindingText(binding) {
    if (binding.scope === 'conversation') {
        var conv = state.conversations && state.conversations[binding.targetId];
        return contentModuleScopeLabel('conversation') + ' · ' + (conv && conv.title || binding.targetId);
    }
    if (binding.scope === 'character') {
        var character = state.characters && state.characters[binding.targetId];
        return contentModuleScopeLabel('character') + ' · ' + (character && character.name || binding.targetId);
    }
    return contentModuleScopeLabel('global');
}

function contentModuleStatusText(module) {
    var parts = [
        t('content_module_version') + ' ' + module.version,
        t('content_module_items').replace('{count}', String(contentModuleItemCount(module))),
        t('content_module_assets').replace('{count}', String((module.assets || []).length))
    ];
    if (module.source) parts.push(module.source);
    if (module.invalid === true) parts.push(t('automation_invalid_definition'));
    if (!isContentModuleAuthorized(module)) parts.push(t('content_module_not_authorized'));
    if (contentModuleHasSendActions(module) && !isContentModuleSendAuthorized(module)) parts.push(t('content_module_send_requires_grant'));
    return parts.join(' · ');
}

function hydrateContentModuleSettings() {
    var button = document.getElementById('contentModuleManageBtn');
    if (button) {
        button.onclick = openContentModuleManager;
        button.textContent = t('content_module_manage');
    }
    var status = document.getElementById('contentModuleSettingsStatus');
    if (status) {
        var modules = getContentModules();
        var effective = getContentModuleEffectiveModules(getActiveConv()).length;
        status.textContent = t('content_module_status_summary')
            .replace('{count}', String(modules.length))
            .replace('{effective}', String(effective));
    }
}

function refreshContentModuleManager() {
    var dialog = document.getElementById('contentModuleManager');
    if (!dialog) return;
    var modules = getContentModules();
    var bindings = getContentModuleBindings();
    var conv = getActiveConv();
    dialog.querySelector('[data-content-module-list]').innerHTML = (failedContentModuleDraft
        ? '<div class="feature-toolbar"><button type="button" data-content-module-retry>' + escapeHtml(t('content_module_retry')) + '</button></div>'
        : '') + (modules.map(function(module, index) {
        var moduleBindings = bindings.filter(function(binding) { return binding.moduleId === module.id; });
        var bindingText = moduleBindings.length ? moduleBindings.map(contentModuleBindingText).join(' / ') : t('content_module_status_unbound');
        return '<div class="feature-row"><span><strong>' + escapeHtml(module.name) + '</strong><small>' +
            escapeHtml(contentModuleStatusText(module)) + '</small><small>' + escapeHtml(bindingText) + ' · ' +
            escapeHtml(t('content_module_order')) + ' ' + (index + 1) + '</small></span>' +
            '<button type="button" data-content-module-detail="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_detail')) + '</button>' +
            '<button type="button" data-content-module-bind="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_bind')) + '</button>' +
            (isContentModuleAuthorized(module) ? '' : '<button type="button" data-content-module-grant="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_grant')) + '</button>') +
            (contentModuleHasSendActions(module) && !isContentModuleSendAuthorized(module) ? '<button type="button" data-content-module-send-grant="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_send_grant')) + '</button>' : '') +
            '<button type="button" data-content-module-update="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_update')) + '</button>' +
            (module.previousVersions && module.previousVersions.length ? '<button type="button" data-content-module-rollback="' + escapeHtml(module.id) + '">' + escapeHtml(t('content_module_rollback')) + '</button>' : '') +
            '<button type="button" data-content-module-copy="' + escapeHtml(module.id) + '">' + escapeHtml(t('automation_copy')) + '</button>' +
            '<button type="button" data-content-module-export="' + escapeHtml(module.id) + '">' + escapeHtml(t('automation_export')) + '</button>' +
            '<button type="button" data-content-module-move="' + escapeHtml(module.id) + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>' + escapeHtml(t('automation_up')) + '</button>' +
            '<button type="button" data-content-module-move="' + escapeHtml(module.id) + '" data-direction="1"' + (index === modules.length - 1 ? ' disabled' : '') + '>' + escapeHtml(t('automation_down')) + '</button>' +
            '<button type="button" data-content-module-delete="' + escapeHtml(module.id) + '">' + escapeHtml(t('automation_delete')) + '</button></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('content_module_empty_list')) + '</p>');
    var inherit = dialog.querySelector('[data-content-module-inherit]');
    if (inherit) {
        if (!conv) {
            inherit.innerHTML = '<p class="feature-hint">' + escapeHtml(t('content_module_no_conversation')) + '</p>';
        } else {
            var disabled = contentModuleConversationDisabledIds(conv);
            inherit.innerHTML = '<p class="feature-hint">' + escapeHtml(t('content_module_inherit_hint')) + '</p>' +
                modules.map(function(module) {
                    return '<label class="feature-check"><input type="checkbox" data-content-module-conv-off="' + escapeHtml(module.id) + '"' +
                        (disabled.indexOf(module.id) >= 0 ? '' : ' checked') + '>' + escapeHtml(module.name) + '</label>';
                }).join('');
        }
    }
}

function openContentModuleManager() {
    var dialog = openFeatureDialog('contentModuleManager', t('content_module_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('content_module_manager_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-content-module-new>' + escapeHtml(t('content_module_new')) + '</button>' +
        '<button type="button" data-content-module-import>' + escapeHtml(t('automation_import')) + '</button>' +
        '<button type="button" data-content-module-assembly>' + escapeHtml(t('content_module_assembly')) + '</button></div>' +
        '<input id="contentModuleImportFile" type="file" accept=".json,application/json" hidden>' +
        '<input id="contentModuleUpdateFile" type="file" accept=".json,application/json" hidden>' +
        '<div data-content-module-list></div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_inherit_title')) + '</h3>' +
        '<div data-content-module-inherit></div>', null);
    dialog.addEventListener('click', async function(event) {
        var inheritBox = event.target.closest('[data-content-module-conv-off]');
        if (inheritBox) {
            var moduleId = inheritBox.dataset.contentModuleConvOff;
            try {
                await saveContentModulesChange(function(candidate) {
                    var conv = getActiveConv();
                    if (!conv) throw new Error(t('content_module_no_conversation'));
                    var disabled = candidate.contentModuleConversationDisabled[conv.id] || [];
                    disabled = disabled.filter(function(id) { return id !== moduleId; });
                    if (!inheritBox.checked) disabled.push(moduleId);
                    candidate.contentModuleConversationDisabled[conv.id] = disabled;
                });
                cancelContentModuleRuntime(moduleId);
            } catch (error) {
                dialog.querySelector('.feature-error').textContent = error.message;
            }
            refreshContentModuleManager();
            return;
        }
        var button = event.target.closest('button');
        if (!button) return;
        var modules = getContentModules();
        try {
            if (button.hasAttribute('data-content-module-new')) openContentModuleCreateDialog();
            if (button.hasAttribute('data-content-module-retry')) await retryContentModuleChange();
            if (button.hasAttribute('data-content-module-import')) dialog.querySelector('#contentModuleImportFile').click();
            if (button.hasAttribute('data-content-module-assembly')) openContentModuleAssemblyPreview();
            if (button.dataset.contentModuleDetail) openContentModuleDetail(modules.find(function(module) { return module.id === button.dataset.contentModuleDetail; }));
            if (button.dataset.contentModuleBind) openContentModuleBindEditor(modules.find(function(module) { return module.id === button.dataset.contentModuleBind; }), null);
            if (button.dataset.contentModuleGrant) await grantContentModuleLocally(button.dataset.contentModuleGrant);
            if (button.dataset.contentModuleSendGrant) await grantContentModuleSendLocally(button.dataset.contentModuleSendGrant);
            if (button.dataset.contentModuleUpdate) {
                dialog.querySelector('#contentModuleUpdateFile').dataset.moduleId = button.dataset.contentModuleUpdate;
                dialog.querySelector('#contentModuleUpdateFile').click();
            }
            if (button.dataset.contentModuleRollback && await confirmFeatureAction(t('content_module_rollback_confirm'), t('content_module_rollback'))) {
                await rollbackContentModule(button.dataset.contentModuleRollback);
            }
            if (button.dataset.contentModuleCopy) {
                var source = modules.find(function(module) { return module.id === button.dataset.contentModuleCopy; });
                if (!source) throw new Error(t('content_module_missing'));
                var copy = cloneContentModuleForCopy(source);
                await saveContentModulesChange(function(candidate) { candidate.contentModules.push(copy); });
            }
            if (button.dataset.contentModuleExport) {
                var target = modules.find(function(module) { return module.id === button.dataset.contentModuleExport; });
                downloadJsonFile(exportContentModuleData(target), 'opentavern-content-module.json');
            }
            if (button.dataset.contentModuleMove) {
                await saveContentModulesChange(function(candidate) {
                    var from = candidate.contentModules.findIndex(function(module) { return module.id === button.dataset.contentModuleMove; });
                    var to = from + Number(button.dataset.direction);
                    if (from < 0 || to < 0 || to >= candidate.contentModules.length) return;
                    var moved = candidate.contentModules.splice(from, 1)[0];
                    candidate.contentModules.splice(to, 0, moved);
                });
            }
            if (button.dataset.contentModuleDelete && await confirmFeatureAction(t('content_module_delete_confirm'), t('automation_delete'))) {
                var deleted = button.dataset.contentModuleDelete;
                cancelContentModuleRuntime(deleted);
                await saveContentModulesChange(function(candidate) {
                    candidate.contentModules = candidate.contentModules.filter(function(module) { return module.id !== deleted; });
                    candidate.contentModuleBindings = candidate.contentModuleBindings.filter(function(binding) { return binding.moduleId !== deleted; });
                    Object.keys(candidate.contentModuleConversationDisabled).forEach(function(conversationId) {
                        candidate.contentModuleConversationDisabled[conversationId] = candidate.contentModuleConversationDisabled[conversationId].filter(function(id) { return id !== deleted; });
                    });
                    delete candidate.contentModuleGrants[deleted];
                });
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
        refreshContentModuleManager();
    });
    dialog.querySelector('#contentModuleImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            var imported = await readContentModulePackageFile(file);
            openContentModuleImportPreview(imported, dialog);
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    };
    dialog.querySelector('#contentModuleUpdateFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        var targetId = event.target.dataset.moduleId;
        event.target.value = '';
        if (!file) return;
        try {
            var imported = await readContentModulePackageFile(file);
            if (imported.id !== targetId) throw new Error(t('content_module_update_id_mismatch'));
            openContentModuleImportPreview(imported, dialog, targetId);
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    };
    refreshContentModuleManager();
}

async function readContentModulePackageFile(file) {
    var module = await readContentModulePackage(file);
    for (var index = 0; index < (module.assets || []).length; index++) {
        await verifyContentModuleAsset(module.assets[index]);
    }
    return module;
}

function openContentModuleDetail(module) {
    if (!module) return;
    var assets = (module.assets || []).map(function(asset) {
        return '<div class="feature-row content-module-asset"><span><strong>' + escapeHtml(asset.name) + '</strong><small>' +
            escapeHtml(asset.mime + ' · ' + contentModuleFormatBytes(asset.bytes)) + ' · ' +
            escapeHtml(t('content_module_asset_refs').replace('{refs}', contentModuleAssetUsage(module, asset.id).join(' / ') || t('content_module_asset_unused'))) +
            '</small></span><img src="' + escapeHtml(asset.dataUrl) + '" alt="' + escapeHtml(asset.name) + '">' +
            '<button type="button" data-content-module-download="' + escapeHtml(asset.id) + '">' + escapeHtml(t('content_module_asset_download')) + '</button></div>';
    }).join('');
    var bindings = getContentModuleBindings().filter(function(binding) { return binding.moduleId === module.id; });
    var body = '<p class="feature-hint">' + escapeHtml(module.description || t('content_module_no_description')) + '</p>' +
        '<div class="feature-row"><span><strong>' + escapeHtml(module.name) + '</strong><small>' + escapeHtml(contentModuleStatusText(module)) + '</small></span></div>' +
        ((module.dependencies || []).length ? '<p class="feature-hint">' + escapeHtml(t('content_module_dependencies').replace('{deps}', module.dependencies.map(function(dependency) { return dependency.moduleId + '@' + dependency.version; }).join(', '))) + '</p>' : '') +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_detail_items')) + '</h3>' +
        '<div>' + (module.items.worldBooks || []).map(function(book) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(book.name) + '</strong><small>' + escapeHtml(t('content_module_kind_worldbooks')) + ' · ' + book.entries.length + '</small></span></div>';
        }).join('') + (module.items.regexScripts || []).map(function(script) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(getRegexScriptFindSource(script) || script.id) + '</strong><small>' + escapeHtml(t('content_module_kind_regex')) + '</small></span></div>';
        }).join('') + (module.items.automationRules || []).map(function(rule) {
            var sendNote = (rule.actions || []).some(function(action) { return action && action.type === 'send-message'; }) ? ' · ' + t('content_module_send_requires_grant') : '';
            return '<div class="feature-row"><span><strong>' + escapeHtml(rule.name) + '</strong><small>' + escapeHtml(t('content_module_kind_rules') + ' · ' + automationEventLabel(rule.event) + sendNote) + '</small></span></div>';
        }).join('') + (module.items.scenePackages || []).map(function(scene) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(scene.name) + '</strong><small>' + escapeHtml(t('content_module_kind_scenes') + ' · ' + scene.events.length) + '</small></span></div>';
        }).join('') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_bindings')) + '</h3>' +
        '<div>' + (bindings.length ? bindings.map(function(binding) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(contentModuleBindingText(binding)) + '</strong><small>' +
                escapeHtml(binding.enabled === false ? t('automation_disabled') : t('automation_enabled')) + '</small></span>' +
                '<button type="button" data-content-module-binding-toggle="' + escapeHtml(binding.id) + '">' + escapeHtml(binding.enabled === false ? t('content_module_enable') : t('content_module_disable')) + '</button>' +
                '<button type="button" data-content-module-unbind="' + escapeHtml(binding.id) + '">' + escapeHtml(t('content_module_unbind')) + '</button></div>';
        }).join('') : '<p class="feature-hint">' + escapeHtml(t('content_module_status_unbound')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_assets').replace('{count}', String((module.assets || []).length))) + '</h3>' +
        '<div>' + (assets || '<p class="feature-hint">' + escapeHtml(t('content_module_no_assets')) + '</p>') + '</div>';
    var dialog = openFeatureDialog('contentModuleDetail', module.name, body, null);
    dialog.addEventListener('click', async function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        try {
            if (button.dataset.contentModuleDownload) {
                var asset = (module.assets || []).find(function(item) { return item.id === button.dataset.contentModuleDownload; });
                if (!asset) throw new Error(t('content_module_asset_invalid'));
                var link = document.createElement('a');
                link.href = asset.dataUrl;
                link.download = contentModuleAssetDownloadName(asset);
                link.click();
            }
            if (button.dataset.contentModuleBindingToggle) {
                await saveContentModulesChange(function(candidate) {
                    var binding = candidate.contentModuleBindings.find(function(item) { return item.id === button.dataset.contentModuleBindingToggle; });
                    if (!binding) throw new Error(t('content_module_binding_missing'));
                    binding.enabled = binding.enabled === false;
                });
                cancelContentModuleRuntime(module.id);
                dialog.close();
                openContentModuleDetail(getContentModuleById(module.id));
            }
            if (button.dataset.contentModuleUnbind && await confirmFeatureAction(t('content_module_unbind_confirm'), t('content_module_unbind'))) {
                await saveContentModulesChange(function(candidate) {
                    candidate.contentModuleBindings = candidate.contentModuleBindings.filter(function(item) { return item.id !== button.dataset.contentModuleUnbind; });
                });
                cancelContentModuleRuntime(module.id);
                dialog.close();
                openContentModuleDetail(getContentModuleById(module.id));
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    });
}

function openContentModuleBindEditor(module, binding) {
    if (!module) return;
    var working = binding ? JSON.parse(JSON.stringify(binding)) : { id: '', moduleId: module.id, scope: 'global', targetId: '', enabled: true };
    var dialog = openFeatureDialog('contentModuleBindingEditor', t('content_module_bind'),
        featureSelect(t('content_module_bind_scope'), 'contentModuleBindingScope', working.scope, [
            ['global', contentModuleScopeLabel('global')], ['character', contentModuleScopeLabel('character')], ['conversation', contentModuleScopeLabel('conversation')]
        ]) +
        '<div data-content-module-bind-target></div>' +
        '<label class="feature-check"><input id="contentModuleBindingEnabled" type="checkbox"' + (working.enabled === false ? '' : ' checked') + '>' + escapeHtml(t('automation_enabled')) + '</label>',
        async function(editor) {
            working.scope = editor.querySelector('#contentModuleBindingScope').value;
            var target = editor.querySelector('#contentModuleBindingTarget');
            working.targetId = working.scope === 'global' ? '' : (target ? target.value : '');
            working.enabled = editor.querySelector('#contentModuleBindingEnabled').checked;
            if (working.scope !== 'global' && !working.targetId) throw new Error(t('automation_target_required'));
            await saveContentModulesChange(function(candidate) {
                if (working.id) {
                    var existing = candidate.contentModuleBindings.find(function(item) { return item.id === working.id; });
                    if (!existing) throw new Error(t('content_module_binding_missing'));
                    existing.scope = working.scope; existing.targetId = working.targetId; existing.enabled = working.enabled;
                } else {
                    working.id = contentModuleNewId('content-module-binding');
                    candidate.contentModuleBindings.push({ id: working.id, moduleId: module.id, scope: working.scope, targetId: working.targetId, enabled: working.enabled, order: candidate.contentModuleBindings.length });
                }
            });
            cancelContentModuleRuntime(module.id);
            refreshContentModuleManager();
        }, { saveLabel: t('content_module_save') });
    function renderTarget() {
        var scope = dialog.querySelector('#contentModuleBindingScope').value;
        var host = dialog.querySelector('[data-content-module-bind-target]');
        if (scope === 'global') { host.innerHTML = ''; return; }
        var choices = typeof automationTargetChoices === 'function' ? automationTargetChoices(scope) : [];
        if (!choices.length) choices = [['', t('automation_target_unavailable')]];
        host.innerHTML = featureSelect(t('content_module_bind_target'), 'contentModuleBindingTarget', working.targetId, choices);
    }
    dialog.querySelector('#contentModuleBindingScope').onchange = renderTarget;
    renderTarget();
}

async function grantContentModuleLocally(moduleId) {
    await saveContentModulesChange(function(candidate) { setContentModuleGrant(candidate, moduleId, true); });
    refreshContentModuleManager();
}

async function grantContentModuleSendLocally(moduleId) {
    await saveContentModulesChange(function(candidate) { setContentModuleSendGrant(candidate, moduleId, true); });
    refreshContentModuleManager();
}

function openContentModuleAssemblyPreview() {
    var conv = getActiveConv();
    var assembly = getContentModuleAssembly(conv);
    var worldbookOrder = [];
    var regexOrder = [];
    assembly.modules.forEach(function(entry) {
        (entry.module.items.worldBooks || []).forEach(function(book) {
            (book.entries || []).forEach(function(item, index) {
                worldbookOrder.push(entry.module.name + ' → ' + book.name + ' → ' + (item.comment || item.id) + ' (' + (index + 1) + ')');
            });
        });
        (entry.module.items.regexScripts || []).forEach(function(script, index) {
            regexOrder.push(entry.module.name + ' → ' + (getRegexScriptFindSource(script) || script.id) + ' (' + (index + 1) + ')');
        });
    });
    var body = '<p class="feature-hint">' + escapeHtml(t('content_module_assembly_hint')) + '</p>' +
        '<p class="feature-hint">' + escapeHtml(t('content_module_assembly_budget').replace('{budget}', state.settings.worldInfoBudgetEnabled ? String(state.settings.worldInfoBudget) : t('content_module_assembly_no_budget'))) + '</p>' +
        '<div>' + assembly.modules.map(function(entry, index) {
            return '<div class="feature-row"><span><strong>' + (index + 1) + '. ' + escapeHtml(entry.module.name) + '</strong><small>' +
                escapeHtml(t('content_module_version') + ' ' + entry.module.version + ' · ' +
                    entry.bindings.map(function(binding) { return contentModuleBindingText(binding); }).join(' / ')) + '</small>' +
                '<small>' + escapeHtml(t('content_module_worldbook_entries').replace('{count}', String((entry.module.items.worldBooks || []).reduce(function(sum, book) { return sum + book.entries.length; }, 0))) +
                    ' · ' + t('content_module_regex_count').replace('{count}', String((entry.module.items.regexScripts || []).length)) + ' · ' +
                    t('content_module_rules_count').replace('{count}', String((entry.module.items.automationRules || []).length)) + ' · ' +
                    t('content_module_scenes_count').replace('{count}', String((entry.module.items.scenePackages || []).length))) + '</small></span></div>';
        }).join('') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_assembly_worldbook')) + '</h3>' +
        '<div>' + (worldbookOrder.length ? worldbookOrder.map(function(line) { return '<div class="feature-hint">' + escapeHtml(line) + '</div>'; }).join('') : '<p class="feature-hint">' + escapeHtml(t('content_module_assembly_none')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_assembly_regex')) + '</h3>' +
        '<div>' + (regexOrder.length ? regexOrder.map(function(line) { return '<div class="feature-hint">' + escapeHtml(line) + '</div>'; }).join('') : '<p class="feature-hint">' + escapeHtml(t('content_module_assembly_none')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_assembly_off')) + '</h3>' +
        '<div>' + (assembly.statuses.length ? assembly.statuses.map(function(entry) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(entry.module.name) + '</strong><small>' + escapeHtml(entry.reason) + '</small></span></div>';
        }).join('') : '<p class="feature-hint">' + escapeHtml(t('content_module_assembly_all_on')) + '</p>') + '</div>';
    openFeatureDialog('contentModuleAssembly', t('content_module_assembly'), body, null);
}

function openContentModuleCreateDialog() {
    var worldBooks = Object.keys(state.worldBooks || {}).map(function(key) {
        var book = state.worldBooks[key];
        return '<label class="feature-check"><input type="checkbox" data-content-module-worldbook="' + escapeHtml(key) + '">' + escapeHtml(book && book.name || key) + '</label>';
    }).join('');
    var regexChoices = (state.settings.globalRegexScripts || []).map(function(script, index) {
        return '<label class="feature-check"><input type="checkbox" data-content-module-regex-layer="global" data-content-module-regex-index="' + index + '">' +
            escapeHtml(t('content_module_kind_regex') + ' · ' + (getRegexScriptFindSource(script) || index)) + '</label>';
    }).concat(((state.settings.sillyTavernPreset && state.settings.sillyTavernPreset.regexScripts) || []).map(function(script, index) {
        return '<label class="feature-check"><input type="checkbox" data-content-module-regex-layer="preset" data-content-module-regex-index="' + index + '">' +
            escapeHtml(t('content_module_kind_preset_regex') + ' · ' + (getRegexScriptFindSource(script) || index)) + '</label>';
    })).join('');
    var rules = getAutomationRules().map(function(rule) {
        return '<label class="feature-check"><input type="checkbox" data-content-module-rule="' + escapeHtml(rule.id) + '">' + escapeHtml(rule.name) + '</label>';
    }).join('');
    var scenes = getScenePackages().map(function(pkg) {
        return '<label class="feature-check"><input type="checkbox" data-content-module-scene="' + escapeHtml(pkg.id) + '">' + escapeHtml(pkg.name) + '</label>';
    }).join('');
    var dialog = openFeatureDialog('contentModuleCreate', t('content_module_new'),
        featureField(t('content_module_name'), 'contentModuleName', '') +
        featureField(t('content_module_version'), 'contentModuleVersion', '1.0.0', 'text', 'inputmode="numeric"') +
        featureField(t('content_module_description'), 'contentModuleDescription', '', 'textarea', 'maxlength="1000"') +
        featureField(t('content_module_source'), 'contentModuleSource', t('content_module_source_local'), 'text', 'maxlength="200"') +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_kind_worldbooks')) + '</h3><div>' + (worldBooks || '<p class="feature-hint">' + escapeHtml(t('content_module_host_empty')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_kind_regex')) + '</h3><div>' + (regexChoices || '<p class="feature-hint">' + escapeHtml(t('content_module_host_empty')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_kind_rules')) + '</h3><div>' + (rules || '<p class="feature-hint">' + escapeHtml(t('content_module_host_empty')) + '</p>') + '</div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('content_module_kind_scenes')) + '</h3><div>' + (scenes || '<p class="feature-hint">' + escapeHtml(t('content_module_host_empty')) + '</p>') + '</div>' +
        '<label class="feature-field"><span>' + escapeHtml(t('content_module_assets_add')) + '</span><input id="contentModuleAssetFiles" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label>' +
        '<p class="feature-hint">' + escapeHtml(t('content_module_asset_limits').replace('{limit}', contentModuleFormatBytes(CONTENT_MODULE_MAX_ASSET_BYTES)).replace('{total}', contentModuleFormatBytes(CONTENT_MODULE_MAX_TOTAL_ASSET_BYTES))) + '</p>' +
        '<label class="feature-check"><input id="contentModuleGrantOnCreate" type="checkbox">' + escapeHtml(t('content_module_grant_on_create')) + '</label>',
        async function(editor) {
            var selected = function(selector) { return Array.from(editor.querySelectorAll(selector)); };
            var assets = [];
            var files = Array.from(editor.querySelector('#contentModuleAssetFiles').files || []);
            if (files.length > CONTENT_MODULE_MAX_ASSETS) throw new Error(t('content_module_asset_too_many'));
            for (var index = 0; index < files.length; index++) assets.push(await prepareContentModuleAssetFromFile(files[index]));
            var total = assets.reduce(function(sum, asset) { return sum + asset.bytes; }, 0);
            if (total > CONTENT_MODULE_MAX_TOTAL_ASSET_BYTES) throw new Error(t('content_module_asset_too_large').replace('{limit}', contentModuleFormatBytes(CONTENT_MODULE_MAX_TOTAL_ASSET_BYTES)));
            var module = contentModuleFromHost({
                name: editor.querySelector('#contentModuleName').value,
                version: editor.querySelector('#contentModuleVersion').value,
                description: editor.querySelector('#contentModuleDescription').value,
                source: editor.querySelector('#contentModuleSource').value,
                worldBookIds: selected('[data-content-module-worldbook]').filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.contentModuleWorldbook; }),
                regexScripts: selected('[data-content-module-regex-index]').filter(function(input) { return input.checked; }).map(function(input) {
                    return { layer: input.dataset.contentModuleRegexLayer, index: Number(input.dataset.contentModuleRegexIndex) };
                }),
                automationRuleIds: selected('[data-content-module-rule]').filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.contentModuleRule; }),
                scenePackageIds: selected('[data-content-module-scene]').filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.contentModuleScene; }),
                assets: assets
            });
            validateContentModule(module);
            await saveContentModulesChange(function(candidate) {
                candidate.contentModules.push(module);
                if (editor.querySelector('#contentModuleGrantOnCreate').checked) setContentModuleGrant(candidate, module.id, true);
            });
            refreshContentModuleManager();
        }, { saveLabel: t('content_module_save') });
    void dialog;
}

function openContentModuleImportPreview(module, manager, updateTargetId) {
    var existing = updateTargetId ? getContentModuleById(updateTargetId) : getContentModuleById(module.id);
    var update = !!(existing && (updateTargetId || module.version !== existing.version));
    var diff = existing ? contentModuleDiffSummary(existing, module) : [];
    var body = '<p class="feature-hint">' + escapeHtml(t('content_module_import_note')) + '</p>' +
        '<div class="feature-row"><span><strong>' + escapeHtml(module.name) + '</strong><small>' +
        escapeHtml(t('content_module_version') + ' ' + module.version + ' · ' + (module.source || t('content_module_import_source'))) + '</small><small>' +
        escapeHtml(t('content_module_items').replace('{count}', String(contentModuleItemCount(module))) + ' · ' + t('content_module_assets').replace('{count}', String((module.assets || []).length))) + '</small></span></div>' +
        ((module.dependencies || []).length ? '<p class="feature-hint">' + escapeHtml(t('content_module_dependencies').replace('{deps}', module.dependencies.map(function(dependency) { return dependency.moduleId + '@' + dependency.version; }).join(', '))) + '</p>' : '') +
        (existing ? '<h3 class="feature-section-title">' + escapeHtml(t('content_module_update_diff')) + '</h3><div class="feature-hint">' + diff.map(escapeHtml).join('<br>') + '</div>' : '') +
        (existing ? '<p class="feature-hint">' + escapeHtml(t('content_module_update_impact').replace('{count}', String(getContentModuleBindings().filter(function(binding) { return binding.moduleId === existing.id; }).length))) + '</p>' : '') +
        '<label class="feature-check"><input id="contentModuleImportAsUpdate" type="checkbox"' + (update ? ' checked' : '') + (existing ? '' : ' disabled') + '>' + escapeHtml(t('content_module_import_as_update')) + '</label>' +
        '<label class="feature-check"><input id="contentModuleGrantOnImport" type="checkbox">' + escapeHtml(t('content_module_grant_on_import')) + '</label>';
    var dialog = openFeatureDialog('contentModuleImportPreview', t('automation_import_preview'),
        body,
        async function(editor) {
            var asUpdate = existing && editor.querySelector('#contentModuleImportAsUpdate').checked;
            var grant = editor.querySelector('#contentModuleGrantOnImport').checked;
            await saveContentModulesChange(function(candidate) {
                var modulesById = Object.create(null);
                candidate.contentModules.forEach(function(item) { modulesById[item.id] = item; });
                var candidateModule = JSON.parse(JSON.stringify(module));
                if (asUpdate) {
                    var index = candidate.contentModules.findIndex(function(item) { return item.id === existing.id; });
                    if (index < 0) throw new Error(t('content_module_missing'));
                    if (candidateModule.version === existing.version && contentModuleFingerprint(candidateModule) !== contentModuleFingerprint(existing)) {
                        throw new Error(t('content_module_update_requires_version'));
                    }
                    candidateModule.id = existing.id;
                    candidateModule.order = existing.order;
                    candidateModule.revision = (Number(existing.revision) || 0) + 1;
                    candidateModule.createdAt = existing.createdAt;
                    candidateModule.updatedAt = Date.now();
                    candidateModule.previousVersions = [contentModuleSnapshotForRollback(existing)].concat(existing.previousVersions || []).slice(0, CONTENT_MODULE_MAX_PREVIOUS);
                    candidate.contentModules[index] = candidateModule;
                    modulesById[candidateModule.id] = candidateModule;
                    validateContentModule(candidateModule, { modulesById: modulesById });
                    if (grant) setContentModuleGrant(candidate, candidateModule.id, true);
                } else {
                    // 导入已有 ID 时按现有复制合同生成新身份；本机许可和旧版状态不随副本继承。
                    if (candidate.contentModules.some(function(item) { return item && item.id === candidateModule.id; })) {
                        candidateModule = cloneContentModuleForCopy(candidateModule);
                    }
                    candidate.contentModules.push(candidateModule);
                    modulesById[candidateModule.id] = candidateModule;
                    validateContentModule(candidateModule, { modulesById: modulesById });
                    if (grant) setContentModuleGrant(candidate, candidateModule.id, true);
                }
            });
            if (asUpdate) cancelContentModuleRuntime(existing.id);
            if (manager) manager.querySelector('.feature-error').textContent = '';
            refreshContentModuleManager();
        }, { saveLabel: t('automation_import_apply') });
    return dialog;
}

async function rollbackContentModule(moduleId) {
    var module = getContentModuleById(moduleId);
    if (!module || !module.previousVersions || !module.previousVersions.length) throw new Error(t('content_module_rollback_missing'));
    var previous = module.previousVersions[0];
    await saveContentModulesChange(function(candidate) {
        var current = candidate.contentModules.find(function(item) { return item.id === moduleId; });
        if (!current) throw new Error(t('content_module_missing'));
        var snapshot = {
            id: current.id, formatVersion: CONTENT_MODULE_FORMAT_VERSION, version: previous.version,
            name: current.name, description: current.description, source: current.source,
            order: current.order, revision: (Number(current.revision) || 0) + 1,
            createdAt: current.createdAt, updatedAt: Date.now(),
            items: JSON.parse(JSON.stringify(previous.items || {})),
            assets: JSON.parse(JSON.stringify(previous.assets || [])),
            dependencies: JSON.parse(JSON.stringify(previous.dependencies || [])),
            hostQuickReplyRefs: JSON.parse(JSON.stringify(previous.hostQuickReplyRefs || [])),
            previousVersions: [contentModuleSnapshotForRollback(current)].slice(0, CONTENT_MODULE_MAX_PREVIOUS)
        };
        var modulesById = Object.create(null);
        candidate.contentModules.forEach(function(item) { modulesById[item.id] = item; });
        modulesById[snapshot.id] = snapshot;
        validateContentModule(snapshot, { modulesById: modulesById });
        current.items = snapshot.items; current.assets = snapshot.assets; current.version = snapshot.version;
        current.revision = snapshot.revision; current.dependencies = snapshot.dependencies;
        current.hostQuickReplyRefs = snapshot.hostQuickReplyRefs; current.previousVersions = snapshot.previousVersions;
        current.updatedAt = snapshot.updatedAt;
    });
    cancelContentModuleRuntime(moduleId);
}
