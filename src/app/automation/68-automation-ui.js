/**
 * 新手导读（文件：68-automation-ui.js）
 *
 * 负责什么：自动化规则的完整管理界面——列表、启停、排序、复制、删除、条件/动作二级编辑、导入预览、
 * 导出、无副作用试算和最近执行记录。
 * 在程序中的位置：入口在设置“扩展”面板；定义 CRUD 是明确的即时事务，不随设置表单的完成/放弃提交。
 * 从哪里开始看：`hydrateAutomationSettings()`、`openAutomationManager()`、`openAutomationRuleEditor(rule)`。
 * 修改时注意：试算不得派发事件、写入变量或修改历史；导入默认停用且不授予自动发送权限。
 */
// ==================== Automation UI ====================

function automationEventLabel(event) {
    var labels = {
        'conversation-created': t('automation_event_conversation_created'),
        'conversation-entered': t('automation_event_conversation_entered'),
        'before-send': t('automation_event_before_send'),
        'user-message-saved': t('automation_event_user_message_saved'),
        'assistant-message-saved': t('automation_event_assistant_message_saved'),
        'worldbook-activated': t('automation_event_worldbook_activated')
    };
    return labels[event] || event;
}

function automationActionLabel(type) {
    var labels = {
        'set-draft': t('automation_action_set_draft'),
        'append-draft': t('automation_action_append_draft'),
        'quick-reply': t('automation_action_quick_reply'),
        'prompt-fragment': t('automation_action_prompt_fragment'),
        'mvu-set': t('automation_action_mvu_set'),
        'block-send': t('automation_action_block_send'),
        'send-message': t('automation_action_send_message')
    };
    return labels[type] || type;
}

function automationConditionSourceLabel(source) {
    var labels = {
        'conversation-id': t('automation_condition_conversation_id'),
        'conversation-title': t('automation_condition_conversation_title'),
        'character-name': t('automation_condition_character_name'),
        'event-role': t('automation_condition_event_role'),
        'event-text': t('automation_condition_event_text'),
        'message-count': t('automation_condition_message_count'),
        'mvu': t('automation_condition_mvu'),
        'worldbook-entry': t('automation_condition_worldbook_entry')
    };
    return labels[source] || source;
}

function automationOpLabel(op) {
    var labels = {
        'equals': t('automation_op_equals'),
        'not-equals': t('automation_op_not_equals'),
        'contains': t('automation_op_contains'),
        'not-contains': t('automation_op_not_contains'),
        'gt': t('automation_op_gt'),
        'gte': t('automation_op_gte'),
        'lt': t('automation_op_lt'),
        'lte': t('automation_op_lte'),
        'exists': t('automation_op_exists'),
        'not-exists': t('automation_op_not_exists')
    };
    return labels[op] || op;
}

function automationScopeLabel(scope) {
    if (scope === 'character') return t('automation_scope_character');
    if (scope === 'conversation') return t('automation_scope_conversation');
    return t('automation_scope_global');
}

function automationValueTypeLabel(type) {
    if (type === 'number') return t('automation_value_number');
    if (type === 'boolean') return t('automation_value_boolean');
    return t('automation_value_string');
}

function automationTargetChoices(scope) {
    var choices = [];
    if (scope === 'character') {
        Object.keys(state.characters || {}).forEach(function(key) {
            var character = state.characters[key];
            if (character && character.name) choices.push([String(character.name).toLowerCase(), character.name]);
        });
        var conv = getActiveConv();
        if (conv && conv.character && conv.character.name && !choices.some(function(item) { return item[0] === String(conv.character.name).toLowerCase(); })) {
            choices.push([String(conv.character.name).toLowerCase(), conv.character.name]);
        }
    } else if (scope === 'conversation') {
        getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations).forEach(function(id) {
            choices.push([id, state.conversations[id] && state.conversations[id].title || id]);
        });
    }
    return choices;
}

function automationRuleScopeText(rule) {
    if (rule.scope === 'global') return automationScopeLabel('global');
    var label = automationScopeLabel(rule.scope);
    if (rule.scope === 'conversation') return label + ' · ' + (state.conversations[rule.targetId] && state.conversations[rule.targetId].title || rule.targetId);
    var character = state.characters && state.characters[rule.targetId];
    return label + ' · ' + (character && character.name || rule.targetId);
}

function automationRuleStatusText(rule) {
    var parts = [automationEventLabel(rule.event), automationRuleScopeText(rule)];
    if (rule.enabled === false) parts.push(t('automation_disabled'));
    if (rule.invalid === true) parts.push(t('automation_invalid_definition'));
    if (!isAutomationRuleAuthorized(rule)) parts.push(t('automation_not_granted'));
    return parts.join(' · ');
}

function hydrateAutomationSettings() {
    var button = document.getElementById('automationManageBtn');
    if (button) {
        button.onclick = openAutomationManager;
        button.textContent = t('automation_manage');
    }
    var status = document.getElementById('automationSettingsStatus');
    if (status) {
        var rules = getAutomationRules();
        var enabled = rules.filter(function(rule) { return rule.enabled; }).length;
        var lastRun = getAutomationRecentRuns()[0];
        status.textContent = t('automation_status_summary')
            .replace('{count}', String(rules.length))
            .replace('{enabled}', String(enabled))
            .replace('{last}', lastRun ? new Date(lastRun.at).toLocaleString() : t('automation_status_never'));
    }
}

function refreshAutomationManager() {
    var dialog = document.getElementById('automationManager');
    if (!dialog) return;
    var rules = getAutomationRules();
    dialog.querySelector('[data-automation-rules]').innerHTML = rules.map(function(rule, index) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(rule.name) + '</strong>' +
            '<small>' + escapeHtml(automationRuleStatusText(rule)) + ' · ' + escapeHtml(t('automation_revision')) + ' ' + rule.revision + '</small></span>' +
            '<label class="feature-check"><input type="checkbox" data-automation-enabled="' + escapeHtml(rule.id) + '"' + (rule.enabled !== false ? ' checked' : '') + '>' + escapeHtml(t('automation_enabled')) + '</label>' +
            (isAutomationRuleAuthorized(rule) ? '' : '<button type="button" data-automation-grant="' + escapeHtml(rule.id) + '">' + escapeHtml(t('automation_grant')) + '</button>') +
            '<button type="button" data-automation-edit="' + escapeHtml(rule.id) + '">' + escapeHtml(t('automation_edit')) + '</button>' +
            '<button type="button" data-automation-copy="' + escapeHtml(rule.id) + '">' + escapeHtml(t('automation_copy')) + '</button>' +
            '<button type="button" data-automation-dry="' + escapeHtml(rule.id) + '">' + escapeHtml(t('automation_dry')) + '</button>' +
            '<button type="button" data-automation-move="' + escapeHtml(rule.id) + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>' + escapeHtml(t('automation_up')) + '</button>' +
            '<button type="button" data-automation-move="' + escapeHtml(rule.id) + '" data-direction="1"' + (index === rules.length - 1 ? ' disabled' : '') + '>' + escapeHtml(t('automation_down')) + '</button>' +
            '<button type="button" data-automation-delete="' + escapeHtml(rule.id) + '">' + escapeHtml(t('automation_delete')) + '</button></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_rules_empty')) + '</p>';
    var recovery = dialog.querySelector('#automationDraftRecovery');
    if (recovery) recovery.remove();
    if (failedAutomationDraft) {
        recovery = document.createElement('div');
        recovery.id = 'automationDraftRecovery';
        recovery.className = 'feature-inline';
        var note = document.createElement('span');
        note.textContent = t('automation_draft_pending');
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = t('automation_retry');
        retry.onclick = async function() {
            retry.disabled = true;
            try {
                var draft = failedAutomationDraft;
                failedAutomationDraft = null;
                await saveAutomationRulesChange(function(candidate) {
                    candidate.automationRules = JSON.parse(JSON.stringify(draft.candidate.automationRules));
                    candidate.automationRuleGrants = JSON.parse(JSON.stringify(draft.candidate.automationRuleGrants));
                    candidate.automationSendGrants = JSON.parse(JSON.stringify(draft.candidate.automationSendGrants));
                }, { baseline: draft.baseline });
                refreshAutomationManager();
            } catch (error) {
                dialog.querySelector('.feature-error').textContent = error.message;
                retry.disabled = false;
            }
        };
        var discard = document.createElement('button');
        discard.type = 'button';
        discard.textContent = t('automation_discard');
        discard.onclick = function() { failedAutomationDraft = null; refreshAutomationManager(); };
        recovery.append(note, retry, discard);
        dialog.querySelector('[data-automation-rules]').before(recovery);
    }
    hydrateAutomationSettings();
}

async function toggleAutomationRuleEnabled(ruleId, enabled) {
    await saveAutomationRulesChange(function(candidate) {
        var rule = candidate.automationRules.find(function(item) { return item.id === ruleId; });
        if (!rule) throw new Error(t('automation_rule_missing'));
        if (enabled === true && rule.invalid === true) throw new Error(t('automation_invalid_rule'));
        rule.enabled = enabled === true;
    });
    if (!enabled && typeof cancelAutomationRuntimeForRule === 'function') cancelAutomationRuntimeForRule(ruleId, null);
}

async function grantAutomationRuleLocally(ruleId) {
    await saveAutomationRulesChange(function(candidate) {
        var rule = candidate.automationRules.find(function(item) { return item.id === ruleId; });
        if (!rule) throw new Error(t('automation_rule_missing'));
        if (rule.invalid === true) throw new Error(t('automation_invalid_rule'));
        var existing = isAutomationRuleAuthorized(rule);
        setAutomationRuleGrant(candidate, rule.id, rule.revision, existing && isAutomationSendAuthorized(rule));
    });
}

function openAutomationManager() {
    var dialog = openFeatureDialog('automationManager', t('automation_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('automation_manager_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-automation-new>' + escapeHtml(t('automation_new')) + '</button>' +
        '<button type="button" data-automation-import>' + escapeHtml(t('automation_import')) + '</button>' +
        '<button type="button" data-automation-export>' + escapeHtml(t('automation_export')) + '</button>' +
        '<button type="button" data-automation-runs>' + escapeHtml(t('automation_runs')) + '</button></div>' +
        '<input id="automationImportFile" type="file" accept=".json,application/json" hidden>' +
        '<div data-automation-rules></div>', null);
    dialog.addEventListener('click', async function(event) {
        var enabledBox = event.target.closest('[data-automation-enabled]');
        if (enabledBox) {
            try { await toggleAutomationRuleEnabled(enabledBox.dataset.automationEnabled, enabledBox.checked); }
            catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
            refreshAutomationManager();
            return;
        }
        var button = event.target.closest('button');
        if (!button) return;
        var rules = getAutomationRules();
        try {
            if (button.hasAttribute('data-automation-new')) openAutomationRuleEditor(null);
            if (button.hasAttribute('data-automation-import')) dialog.querySelector('#automationImportFile').click();
            if (button.hasAttribute('data-automation-export')) downloadJsonFile(exportAutomationRulesData(), 'opentavern-automation-rules.json');
            if (button.hasAttribute('data-automation-runs')) openAutomationRuns();
            if (button.dataset.automationEdit) openAutomationRuleEditor(rules.find(function(rule) { return rule.id === button.dataset.automationEdit; }));
            if (button.dataset.automationGrant) await grantAutomationRuleLocally(button.dataset.automationGrant);
            if (button.dataset.automationDry) openAutomationDryRun(rules.find(function(rule) { return rule.id === button.dataset.automationDry; }));
            if (button.dataset.automationCopy) {
                var source = rules.find(function(rule) { return rule.id === button.dataset.automationCopy; });
                if (!source) throw new Error(t('automation_rule_missing'));
                var copy = cloneAutomationRuleForCopy(source);
                await saveAutomationRulesChange(function(candidate) { candidate.automationRules.push(copy); });
            }
            if (button.dataset.automationDelete && await confirmFeatureAction(t('automation_delete_confirm'), t('automation_delete'))) {
                var deleted = button.dataset.automationDelete;
                await saveAutomationRulesChange(function(candidate) {
                    candidate.automationRules = candidate.automationRules.filter(function(rule) { return rule.id !== deleted; });
                    removeAutomationRuleGrant(candidate, deleted);
                });
                cancelAutomationRuntimeForRule(deleted, null);
            }
            if (button.dataset.automationMove) {
                await saveAutomationRulesChange(function(candidate) {
                    var from = candidate.automationRules.findIndex(function(rule) { return rule.id === button.dataset.automationMove; });
                    var to = from + Number(button.dataset.direction);
                    if (from < 0 || to < 0 || to >= candidate.automationRules.length) return;
                    var moved = candidate.automationRules.splice(from, 1)[0];
                    candidate.automationRules.splice(to, 0, moved);
                });
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
        refreshAutomationManager();
    });
    dialog.querySelector('#automationImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            var imported = importAutomationRulesData(JSON.parse(await file.text()));
            openAutomationImportPreview(imported, dialog);
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    };
    refreshAutomationManager();
}

function openAutomationImportPreview(rules, manager) {
    var rows = rules.map(function(rule) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(rule.name) + '</strong><small>' +
            escapeHtml(automationEventLabel(rule.event)) + ' · ' + escapeHtml(automationScopeLabel(rule.scope)) + '</small></span></div>';
    }).join('');
    openFeatureDialog('automationImportPreview', t('automation_import_preview'),
        '<p class="feature-hint">' + escapeHtml(t('automation_import_note')) + '</p><div>' + rows + '</div>',
        async function() {
            await saveAutomationRulesChange(function(candidate) {
                rules.forEach(function(rule) { candidate.automationRules.push(JSON.parse(JSON.stringify(rule))); });
            });
            if (manager) manager.querySelector('.feature-error').textContent = '';
            refreshAutomationManager();
        }, { saveLabel: t('automation_import_apply') });
}

function openAutomationRuns() {
    var runs = getAutomationRecentRuns();
    var body = runs.length ? runs.map(function(entry) {
        var status = entry.status === 'failed' ? t('automation_result_failed') : entry.status === 'skipped' ? t('automation_result_skipped') : entry.status === 'sent' ? t('automation_send_started') : t('automation_result_matched');
        var actions = entry.actions.map(function(action) {
            return escapeHtml(automationActionLabel(action.type) + ' · ' + (action.status === 'failed' ? t('automation_result_failed') : action.status === 'queued' ? t('automation_send_queued') : t('automation_executed')) + (action.detail ? ' · ' + action.detail : ''));
        }).join('<br>');
        return '<div class="feature-row"><span><strong>' + escapeHtml(entry.ruleName || entry.ruleId) + '</strong><small>' +
            escapeHtml(new Date(entry.at).toLocaleString()) + ' · ' + escapeHtml(automationEventLabel(entry.event)) + ' · ' +
            escapeHtml(status) + (entry.detail ? ' · ' + escapeHtml(entry.detail) : '') + '</small></span>' +
            (actions ? '<small>' + actions + '</small>' : '') + '</div>';
    }).join('') : '<p class="feature-hint">' + escapeHtml(t('automation_runs_empty')) + '</p>';
    openFeatureDialog('automationRuns', t('automation_runs_title'), body, null);
}

function openAutomationConditionEditor(condition, onSave) {
    var working = condition ? JSON.parse(JSON.stringify(condition)) : {
        id: makeId(), source: 'conversation-title', op: 'contains', path: '', valueType: 'string', value: ''
    };
    var dialog = openFeatureDialog('automationConditionEditor', condition ? t('automation_edit_condition') : t('automation_add_condition'),
        featureSelect(t('automation_condition_source'), 'automationConditionSource', working.source, AUTOMATION_CONDITION_SOURCES.map(function(source) { return [source, automationConditionSourceLabel(source)]; })) +
        featureSelect(t('automation_operator'), 'automationConditionOp', working.op, AUTOMATION_CONDITION_OPS.map(function(op) { return [op, automationOpLabel(op)]; })) +
        '<div data-automation-condition-fields></div>', async function(editor) {
            working.source = editor.querySelector('#automationConditionSource').value;
            working.op = editor.querySelector('#automationConditionOp').value;
            var path = editor.querySelector('#automationConditionPath');
            var valueType = editor.querySelector('#automationConditionValueType');
            var value = editor.querySelector('#automationConditionValue');
            var booleanValue = editor.querySelector('#automationConditionBoolean');
            working.path = path ? path.value.trim() : '';
            working.valueType = valueType ? valueType.value : 'string';
            if (working.source === 'message-count') working.valueType = 'number';
            else if (working.source !== 'mvu') working.valueType = 'string';
            if (working.source === 'mvu') validateAutomationPath(working.path);
            if (working.valueType === 'boolean' && booleanValue) working.value = booleanValue.value === 'true';
            else if (working.valueType === 'number') {
                var numericText = value ? value.value.trim() : '';
                var numeric = Number(numericText);
                if (!numericText || !Number.isFinite(numeric)) throw new Error(t('automation_value_invalid'));
                working.value = numeric;
            } else working.value = value ? value.value : '';
            if (['exists', 'not-exists'].indexOf(working.op) < 0 && String(working.value).length > AUTOMATION_MAX_TEXT) throw new Error(t('automation_conditions_invalid'));
            validateAutomationRule({ name: 'dry-validation', event: 'before-send', scope: 'global', targetId: '', conditions: [working], actions: [] });
            onSave(working);
        }, { lockWhileSaving: true });
    function renderFields() {
        var host = dialog.querySelector('[data-automation-condition-fields]');
        var source = dialog.querySelector('#automationConditionSource').value;
        var op = dialog.querySelector('#automationConditionOp').value;
        if (source === 'mvu') {
            host.innerHTML = featureField(t('automation_path'), 'automationConditionPath', working.path) +
                featureSelect(t('automation_value_type'), 'automationConditionValueType', working.valueType, AUTOMATION_VALUE_TYPES.map(function(type) { return [type, automationValueTypeLabel(type)]; })) +
                '<div data-automation-condition-value></div>';
            renderValue();
        } else if (source === 'worldbook-entry') {
            host.innerHTML = featureField(t('automation_value'), 'automationConditionValue', working.value) +
                '<p class="feature-hint">' + escapeHtml(t('automation_worldbook_value_hint')) + '</p>';
        } else if (source === 'message-count') {
            host.innerHTML = featureField(t('automation_value'), 'automationConditionValue', working.value, 'number', 'step="1"');
        } else if (source === 'event-role') {
            host.innerHTML = featureSelect(t('automation_value'), 'automationConditionValue', working.value, [['user', 'user'], ['assistant', 'assistant'], ['', t('automation_any')]]);
        } else {
            host.innerHTML = featureField(t('automation_value'), 'automationConditionValue', working.value);
        }
        if (['exists', 'not-exists'].indexOf(op) >= 0) {
            var valueHost = host.querySelector('[data-automation-condition-value]');
            if (valueHost) valueHost.innerHTML = '';
        }
    }
    function renderValue() {
        var host = dialog.querySelector('[data-automation-condition-value]');
        if (!host) return;
        var type = dialog.querySelector('#automationConditionValueType');
        if (type && type.value === 'boolean') {
            host.innerHTML = featureSelect(t('automation_value'), 'automationConditionBoolean', working.value === true ? 'true' : 'false', [['true', t('automation_true')], ['false', t('automation_false')]]);
        } else {
            host.innerHTML = featureField(t('automation_value'), 'automationConditionValue', working.value, type && type.value === 'number' ? 'number' : 'text');
        }
    }
    dialog.querySelector('#automationConditionSource').onchange = renderFields;
    dialog.querySelector('#automationConditionOp').onchange = renderFields;
    dialog.addEventListener('change', function(event) {
        if (event.target && event.target.id === 'automationConditionValueType') {
            working.valueType = event.target.value;
            renderValue();
        }
    });
    renderFields();
}

function automationQuickReplyGroupOptions(selected) {
    ensureQuickReplyGroups();
    var groups = (state.settings.quickReplyGroups || []).filter(function(group) { return group.enabled !== false; });
    var choices = groups.map(function(group) { return [group.id, group.name]; });
    if (selected && !choices.some(function(item) { return item[0] === selected; })) choices.unshift([selected, selected]);
    return choices.length ? choices : [['', t('automation_quick_unavailable')]];
}

function automationQuickReplyButtonOptions(groupId, selected) {
    var group = (state.settings.quickReplyGroups || []).find(function(item) { return item.id === groupId; });
    var buttons = group && Array.isArray(group.buttons) ? group.buttons.filter(function(button) { return button.enabled !== false; }) : [];
    var choices = buttons.map(function(button) { return [button.id, button.name]; });
    if (selected && !choices.some(function(item) { return item[0] === selected; })) choices.unshift([selected, selected]);
    return choices.length ? choices : [['', t('automation_quick_unavailable')]];
}

function openAutomationActionEditor(action, onSave) {
    var working = action ? JSON.parse(JSON.stringify(action)) : { id: makeId(), type: 'append-draft', text: '' };
    var dialog = openFeatureDialog('automationActionEditor', action ? t('automation_edit_action') : t('automation_add_action'),
        featureSelect(t('automation_action_type'), 'automationActionType', working.type, AUTOMATION_ACTION_TYPES.map(function(type) { return [type, automationActionLabel(type)]; })) +
        '<div data-automation-action-fields></div>', async function(editor) {
            working.type = editor.querySelector('#automationActionType').value;
            if (working.type === 'set-draft' || working.type === 'append-draft' || working.type === 'prompt-fragment') {
                working.text = editor.querySelector('#automationActionText').value;
                if (!working.text.trim()) throw new Error(t('automation_action_text_required'));
            }
            if (working.type === 'prompt-fragment') working.role = editor.querySelector('#automationActionRole').value;
            if (working.type === 'quick-reply') {
                working.groupId = editor.querySelector('#automationQuickGroup').value;
                working.buttonId = editor.querySelector('#automationQuickButton').value;
                working.mode = editor.querySelector('#automationQuickMode').value;
                if (!working.groupId || !working.buttonId) throw new Error(t('automation_action_quick_required'));
            }
            if (working.type === 'mvu-set') {
                working.path = editor.querySelector('#automationActionPath').value.trim();
                working.valueType = editor.querySelector('#automationActionValueType').value;
                var rawValue = editor.querySelector('#automationActionValue').value;
                validateAutomationPath(working.path);
                if (working.valueType === 'number') {
                    var numericValue = rawValue.trim();
                    var parsedValue = Number(numericValue);
                    if (!numericValue || !Number.isFinite(parsedValue)) throw new Error(t('automation_value_invalid'));
                    working.value = parsedValue;
                } else if (working.valueType === 'boolean') {
                    if (rawValue !== 'true' && rawValue !== 'false') throw new Error(t('automation_value_invalid'));
                    working.value = rawValue === 'true';
                } else {
                    if (!rawValue.trim()) throw new Error(t('automation_value_invalid'));
                    working.value = rawValue;
                }
            }
            if (working.type === 'block-send') working.reason = editor.querySelector('#automationActionReason').value;
            if (working.type === 'send-message') working.text = editor.querySelector('#automationActionText').value;
            onSave(working);
        }, { lockWhileSaving: true });
    function renderFields() {
        var host = dialog.querySelector('[data-automation-action-fields]');
        var type = dialog.querySelector('#automationActionType').value;
        if (type === 'set-draft' || type === 'append-draft') {
            host.innerHTML = featureField(t('automation_action_text'), 'automationActionText', working.text, 'textarea', 'rows="5"');
        } else if (type === 'prompt-fragment') {
            host.innerHTML = featureSelect(t('automation_action_role'), 'automationActionRole', working.role || 'system', [['system', 'system'], ['user', 'user']]) +
                featureField(t('automation_action_text'), 'automationActionText', working.text, 'textarea', 'rows="4"');
        } else if (type === 'quick-reply') {
            host.innerHTML = featureSelect(t('automation_quick_group'), 'automationQuickGroup', working.groupId || '', automationQuickReplyGroupOptions(working.groupId || '')) +
                '<div data-automation-quick-buttons></div>' +
                featureSelect(t('automation_quick_mode'), 'automationQuickMode', working.mode || 'append', [['append', t('automation_mode_append')], ['replace', t('automation_mode_replace')]]);
            renderQuickButtons();
        } else if (type === 'mvu-set') {
            host.innerHTML = featureField(t('automation_path'), 'automationActionPath', working.path || '') +
                featureSelect(t('automation_value_type'), 'automationActionValueType', working.valueType || 'string', AUTOMATION_VALUE_TYPES.map(function(item) { return [item, automationValueTypeLabel(item)]; })) +
                featureField(t('automation_value'), 'automationActionValue', working.value == null ? '' : working.value) +
                '<p class="feature-hint">' + escapeHtml(t('automation_mvu_permission_hint')) + '</p>';
        } else if (type === 'block-send') {
            host.innerHTML = featureField(t('automation_action_reason'), 'automationActionReason', working.reason || '');
        } else {
            host.innerHTML = featureField(t('automation_send_text'), 'automationActionText', working.text || '', 'textarea', 'rows="3"') +
                '<p class="feature-hint">' + escapeHtml(t('automation_send_action_hint')) + '</p>';
        }
    }
    function renderQuickButtons() {
        var host = dialog.querySelector('[data-automation-quick-buttons]');
        if (!host) return;
        var group = dialog.querySelector('#automationQuickGroup');
        host.innerHTML = featureSelect(t('automation_quick_button'), 'automationQuickButton', working.buttonId || '', automationQuickReplyButtonOptions(group.value, working.buttonId || ''));
    }
    dialog.querySelector('#automationActionType').onchange = renderFields;
    dialog.addEventListener('change', function(event) {
        if (event.target && event.target.id === 'automationQuickGroup') {
            working.buttonId = '';
            renderQuickButtons();
        }
    });
    renderFields();
}

function openAutomationRuleEditor(rule) {
    var isNew = !rule;
    var working = rule ? JSON.parse(JSON.stringify(rule)) : {
        id: makeId(), revision: 0, name: '', enabled: false, event: 'assistant-message-saved',
        scope: 'global', targetId: '', order: (state.settings.automationRules || []).length, conditions: [], actions: []
    };
    var allowSend = !!(rule && isAutomationSendAuthorized(rule));
    var granted = isNew || !!(rule && isAutomationRuleAuthorized(rule));
    var dialog = openFeatureDialog('automationRuleEditor', isNew ? t('automation_new') : t('automation_edit'),
        featureField(t('automation_rule_name'), 'automationRuleName', working.name) +
        featureSelect(t('automation_event'), 'automationRuleEvent', working.event, AUTOMATION_EVENTS.map(function(event) { return [event, automationEventLabel(event)]; })) +
        featureSelect(t('automation_scope'), 'automationRuleScope', working.scope, AUTOMATION_SCOPES.map(function(scope) { return [scope, automationScopeLabel(scope)]; })) +
        '<div data-automation-target></div>' +
        '<label class="feature-check"><input id="automationRuleEnabled" type="checkbox"' + (working.enabled ? ' checked' : '') + '>' + escapeHtml(t('automation_enabled')) + '</label>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('automation_conditions')) + '</h3><div data-automation-conditions></div>' +
        '<div class="feature-toolbar"><button type="button" data-automation-add-condition>' + escapeHtml(t('automation_add_condition')) + '</button></div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('automation_actions')) + '</h3><div data-automation-actions></div>' +
        '<div class="feature-toolbar"><button type="button" data-automation-add-action>' + escapeHtml(t('automation_add_action')) + '</button></div>' +
        '<label class="feature-check"><input id="automationRuleGranted" type="checkbox"' + (granted ? ' checked' : '') + '>' + escapeHtml(t('automation_grant')) + '</label>' +
        '<label class="feature-check"><input id="automationAllowSend" type="checkbox"' + (allowSend ? ' checked' : '') + '>' + escapeHtml(t('automation_allow_send')) + '</label>' +
        '<p class="feature-hint">' + escapeHtml(t('automation_allow_send_hint')) + '</p>', async function(editor) {
            working.name = editor.querySelector('#automationRuleName').value.trim();
            if (!working.name) throw new Error(t('automation_name_required'));
            working.event = editor.querySelector('#automationRuleEvent').value;
            working.scope = normalizeAutomationScope(editor.querySelector('#automationRuleScope').value);
            var target = editor.querySelector('#automationRuleTarget');
            working.targetId = working.scope === 'global' ? '' : target && target.value || '';
            working.enabled = editor.querySelector('#automationRuleEnabled').checked;
            granted = editor.querySelector('#automationRuleGranted').checked;
            allowSend = editor.querySelector('#automationAllowSend').checked;
            if (allowSend && !granted) throw new Error(t('automation_grant_required_for_send'));
            if (!working.actions.some(function(action) { return action.type === 'send-message'; }) && allowSend) {
                // 保留用户勾选，但只有实际发送动作才会使用该授权。
            }
            if (working.actions.some(function(action) { return action.type === 'send-message'; }) && !allowSend) throw new Error(t('automation_send_grant_required'));
            delete working.invalid;
            validateAutomationRule(working);
            working.revision = bumpAutomationRuleRevision(working);
            await saveAutomationRulesChange(function(candidate) {
                var index = candidate.automationRules.findIndex(function(item) { return item.id === working.id; });
                if (index >= 0) candidate.automationRules[index] = JSON.parse(JSON.stringify(working));
                else candidate.automationRules.push(JSON.parse(JSON.stringify(working)));
                if (granted) setAutomationRuleGrant(candidate, working.id, working.revision, allowSend);
                else removeAutomationRuleGrant(candidate, working.id);
            });
            if (typeof cancelAutomationRuntimeForRule === 'function') cancelAutomationRuntimeForRule(working.id, working.revision);
            refreshAutomationManager();
        }, { lockWhileSaving: true });
    function renderTarget() {
        var host = dialog.querySelector('[data-automation-target]');
        var scope = normalizeAutomationScope(dialog.querySelector('#automationRuleScope').value);
        if (scope === 'global') { host.innerHTML = ''; return; }
        var choices = automationTargetChoices(scope);
        if (working.targetId && !choices.some(function(item) { return item[0] === working.targetId; })) choices.unshift([working.targetId, working.targetId]);
        host.innerHTML = featureSelect(scope === 'character' ? t('automation_target_character') : t('automation_target_conversation'),
            'automationRuleTarget', working.targetId, choices.length ? choices : [['', t('automation_target_unavailable')]]);
    }
    function renderConditions() {
        dialog.querySelector('[data-automation-conditions]').innerHTML = working.conditions.map(function(condition, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(automationConditionSourceLabel(condition.source)) + ' ' +
                escapeHtml(automationOpLabel(condition.op)) + '</strong><small>' +
                escapeHtml(condition.source === 'mvu' ? condition.path + ' = ' + condition.value : String(condition.value)) + '</small></span>' +
                '<button type="button" data-automation-condition-edit="' + index + '">' + escapeHtml(t('automation_edit')) + '</button>' +
                '<button type="button" data-automation-condition-delete="' + index + '">' + escapeHtml(t('automation_remove')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_no_conditions')) + '</p>';
    }
    function renderActions() {
        dialog.querySelector('[data-automation-actions]').innerHTML = working.actions.map(function(action, index) {
            var detail = action.text || action.reason || action.path || action.buttonId || '';
            return '<div class="feature-row"><span><strong>' + escapeHtml(automationActionLabel(action.type)) + '</strong>' +
                (detail ? '<small>' + escapeHtml(String(detail).slice(0, 120)) + '</small>' : '') + '</span>' +
                '<button type="button" data-automation-action-edit="' + index + '">' + escapeHtml(t('automation_edit')) + '</button>' +
                '<button type="button" data-automation-action-delete="' + index + '">' + escapeHtml(t('automation_remove')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_no_actions')) + '</p>';
        var allowed = AUTOMATION_ALLOWED_ACTIONS[dialog.querySelector('#automationRuleEvent').value] || [];
        dialog.querySelectorAll('[data-automation-action-edit], [data-automation-action-delete]').forEach(function(button) { button.disabled = false; });
        if (!allowed.length) dialog.querySelector('[data-automation-actions]').innerHTML = '<p class="feature-hint">' + escapeHtml(t('automation_no_actions')) + '</p>';
    }
    dialog.querySelector('#automationRuleScope').onchange = renderTarget;
    dialog.querySelector('#automationRuleEvent').onchange = renderActions;
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-automation-add-condition')) {
            openAutomationConditionEditor(null, function(created) { working.conditions.push(created); renderConditions(); });
        }
        if (button.dataset.automationConditionEdit != null) {
            var conditionIndex = Number(button.dataset.automationConditionEdit);
            openAutomationConditionEditor(working.conditions[conditionIndex], function(updated) { working.conditions[conditionIndex] = updated; renderConditions(); });
        }
        if (button.dataset.automationConditionDelete != null) {
            working.conditions.splice(Number(button.dataset.automationConditionDelete), 1);
            renderConditions();
        }
        if (button.hasAttribute('data-automation-add-action')) {
            openAutomationActionEditor(null, function(created) {
                var allowed = AUTOMATION_ALLOWED_ACTIONS[dialog.querySelector('#automationRuleEvent').value] || [];
                if (allowed.indexOf(created.type) < 0) { dialog.querySelector('.feature-error').textContent = t('automation_action_event_invalid'); return; }
                working.actions.push(created);
                renderActions();
            });
        }
        if (button.dataset.automationActionEdit != null) {
            var actionIndex = Number(button.dataset.automationActionEdit);
            openAutomationActionEditor(working.actions[actionIndex], function(updated) { working.actions[actionIndex] = updated; renderActions(); });
        }
        if (button.dataset.automationActionDelete != null) {
            working.actions.splice(Number(button.dataset.automationActionDelete), 1);
            renderActions();
        }
    });
    renderTarget();
    renderConditions();
    renderActions();
}

function openAutomationDryRun(rule) {
    if (!rule) return;
    var conv = getActiveConv();
    if (!conv) {
        alert(t('automation_no_conversation'));
        return;
    }
    var context = buildAutomationDryRunContext(rule);
    var evaluated = evaluateAutomationConditions(rule.conditions, context);
    var status = automationRuleStatusText(rule);
    if (rule.enabled !== false && !automationRuleMatchesConversation(rule, conv)) status += ' · ' + t('automation_target_changed');
    if (!evaluated.matched) status += ' · ' + t('automation_result_skipped');
    var ruleRow = '<div class="feature-row"><span><strong>' + escapeHtml(rule.name) + '</strong><small>' + escapeHtml(status) + '</small></span></div>';
    var conditionRows = rule.conditions.length ? evaluated.reasons.map(function(reason) {
        var condition = rule.conditions.find(function(item) { return item.id === reason.id; });
        return '<div class="feature-row"><span>' + escapeHtml(condition ? automationConditionSourceLabel(condition.source) + ' ' + automationOpLabel(condition.op) : reason.source) +
            '</span><small>' + escapeHtml(reason.matched ? t('automation_result_matched') : t('automation_result_skipped') + ' · ' + reason.reason) + '</small></div>';
    }).join('') : '<p class="feature-hint">' + escapeHtml(t('automation_no_conditions')) + '</p>';
    var actionRows = rule.actions.map(function(action) {
        var lines = [];
        var detail = '';
        if (action.type === 'set-draft' || action.type === 'append-draft') {
            lines.push(t('automation_action_text') + ' · ' + String(action.text || '').slice(0, AUTOMATION_MAX_RUN_DETAIL));
        } else if (action.type === 'prompt-fragment') {
            lines.push(t('automation_action_role') + ' · ' + (action.role === 'user' ? 'user' : 'system'));
            lines.push(t('automation_action_text') + ' · ' + String(action.text || '').slice(0, AUTOMATION_MAX_RUN_DETAIL));
        } else if (action.type === 'quick-reply') {
            var group = (state.settings.quickReplyGroups || []).find(function(item) { return item.id === action.groupId; });
            var button = group && (group.buttons || []).find(function(item) { return item.id === action.buttonId; });
            lines.push(t('automation_quick_group') + ' · ' + (group && group.name || action.groupId));
            lines.push(t('automation_quick_button') + ' · ' + (button && button.name || action.buttonId));
            if (group && group.enabled !== false && button && button.enabled !== false) {
                lines.push(t('automation_action_text') + ' · ' + String(button.content || '').slice(0, AUTOMATION_MAX_RUN_DETAIL));
            } else detail = t('automation_quick_reply_missing');
        } else if (action.type === 'mvu-set') {
            lines.push(t('automation_path') + ' · ' + String(action.path || '').slice(0, AUTOMATION_MAX_PATH));
            lines.push(t('automation_value') + ' · ' + String(action.value == null ? '' : action.value).slice(0, AUTOMATION_MAX_RUN_DETAIL));
            detail = isAutomationRuleAuthorized(rule) ? t('automation_mvu_permission_hint') : t('automation_not_granted');
        } else if (action.type === 'block-send') {
            lines.push(t('automation_action_reason') + ' · ' + String(action.reason || t('automation_blocked_default')).slice(0, AUTOMATION_MAX_RUN_DETAIL));
        } else if (action.type === 'send-message') {
            lines.push(t('automation_send_text') + ' · ' + String(action.text || '').slice(0, AUTOMATION_MAX_RUN_DETAIL));
            detail = isAutomationSendAuthorized(rule) ? t('automation_send_ready') : t('automation_send_requires_grant');
        }
        return '<div class="feature-row"><span><strong>' + escapeHtml(automationActionLabel(action.type)) + '</strong>' +
            (lines.length ? '<small style="white-space:pre-wrap;overflow-wrap:anywhere;">' + escapeHtml(lines.join('\n')) + '</small>' : '') +
            (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</span></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_no_actions')) + '</p>';
    openFeatureDialog('automationDryRun', t('automation_dry_title'),
        '<p class="feature-hint">' + escapeHtml(t('automation_dry_hint')) + '</p>' + ruleRow +
        '<h3 class="feature-section-title">' + escapeHtml(t('automation_conditions')) + '</h3>' + conditionRows +
        '<h3 class="feature-section-title">' + escapeHtml(t('automation_actions')) + '</h3>' + actionRows, null);
}
