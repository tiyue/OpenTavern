/**
 * 新手导读（文件：68-scene-ui.js）
 *
 * 负责什么：场景包的完整管理界面——包/事件的命名、复制、排序、启停、删除、绑定、导入预览、导出、
 * 无副作用预演、已触发进度、执行原因和失败重试。
 * 在程序中的位置：入口在设置“扩展”面板；定义 CRUD 是明确的即时可靠事务，不随设置草稿的完成/放弃提交。
 * 从哪里开始看：`hydrateSceneSettings()`、`openSceneManager()`、`openScenePackageEditor(pkg)`。
 * 修改时注意：预演不得写入消息/变量/进度/执行记录；所有用户文本按安全 DOM 或转义输出。
 */
// ==================== Scene UI ====================

function sceneTriggerLabel(trigger) {
    var labels = {
        'opening': t('scene_trigger_opening'),
        'user-message-saved': t('scene_trigger_user_saved'),
        'assistant-message-saved': t('scene_trigger_assistant_saved')
    };
    return labels[trigger] || trigger;
}

function sceneScopeLabel(scope) {
    if (scope === 'character') return t('automation_scope_character');
    if (scope === 'conversation') return t('automation_scope_conversation');
    return t('automation_scope_global');
}

function sceneConditionSourceLabel(source) {
    if (source === 'away-minutes') return t('scene_condition_away_minutes');
    if (typeof automationConditionSourceLabel === 'function') return automationConditionSourceLabel(source);
    return source;
}

function sceneConditionValueText(condition) {
    if (!condition) return '';
    // 事件消息角色留空在条件引擎中表示“任意”，摘要里也要显示同一语义。
    if (condition.source === 'event-role' && String(condition.value == null ? '' : condition.value) === '') return t('automation_any');
    return String(condition.value == null ? '' : condition.value);
}

function scenePackageScopeText(pkg) {
    if (pkg.scope === 'global') return sceneScopeLabel('global');
    if (pkg.scope === 'conversation') {
        return sceneScopeLabel('conversation') + ' · ' + (state.conversations[pkg.targetId] && state.conversations[pkg.targetId].title || pkg.targetId);
    }
    var character = state.characters && state.characters[pkg.targetId];
    return sceneScopeLabel('character') + ' · ' + (character && character.name || pkg.targetId);
}

function scenePackageStatusText(pkg) {
    var parts = [scenePackageScopeText(pkg), t('scene_events_count').replace('{count}', String((pkg.events || []).length))];
    if (pkg.enabled === false) parts.push(t('automation_disabled'));
    if (pkg.invalid === true) parts.push(t('automation_invalid_definition'));
    if (!isScenePackageAuthorized(pkg)) parts.push(t('scene_not_authorized'));
    return parts.join(' · ');
}

function hydrateSceneSettings() {
    var button = document.getElementById('sceneManageBtn');
    if (button) {
        button.onclick = openSceneManager;
        button.textContent = t('scene_manage');
    }
    var status = document.getElementById('sceneSettingsStatus');
    if (status) {
        var packages = getScenePackages();
        var enabled = packages.filter(function(pkg) { return pkg.enabled; }).length;
        var progress = getSceneProgress(getActiveConv()).length;
        status.textContent = t('scene_status_summary')
            .replace('{count}', String(packages.length))
            .replace('{enabled}', String(enabled))
            .replace('{triggered}', String(progress));
    }
}

function sceneTargetChoices(scope) {
    var choices = typeof automationTargetChoices === 'function' ? automationTargetChoices(scope) : [];
    return choices.length ? choices : [['', t('automation_target_unavailable')]];
}

function refreshSceneManager() {
    var dialog = document.getElementById('sceneManager');
    if (!dialog) return;
    var packages = getScenePackages();
    dialog.querySelector('[data-scene-packages]').innerHTML = packages.map(function(pkg, index) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(pkg.name) + '</strong>' +
            '<small>' + escapeHtml(scenePackageStatusText(pkg)) + ' · ' + escapeHtml(t('automation_revision')) + ' ' + pkg.revision + '</small></span>' +
            '<label class="feature-check"><input type="checkbox" data-scene-enabled="' + escapeHtml(pkg.id) + '"' + (pkg.enabled !== false ? ' checked' : '') + '>' + escapeHtml(t('automation_enabled')) + '</label>' +
            (isScenePackageAuthorized(pkg) ? '' : '<button type="button" data-scene-grant="' + escapeHtml(pkg.id) + '">' + escapeHtml(t('scene_grant')) + '</button>') +
            '<button type="button" data-scene-edit="' + escapeHtml(pkg.id) + '">' + escapeHtml(t('automation_edit')) + '</button>' +
            '<button type="button" data-scene-copy="' + escapeHtml(pkg.id) + '">' + escapeHtml(t('automation_copy')) + '</button>' +
            '<button type="button" data-scene-preflight="' + escapeHtml(pkg.id) + '">' + escapeHtml(t('scene_preflight')) + '</button>' +
            '<button type="button" data-scene-move="' + escapeHtml(pkg.id) + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>' + escapeHtml(t('automation_up')) + '</button>' +
            '<button type="button" data-scene-move="' + escapeHtml(pkg.id) + '" data-direction="1"' + (index === packages.length - 1 ? ' disabled' : '') + '>' + escapeHtml(t('automation_down')) + '</button>' +
            '<button type="button" data-scene-delete="' + escapeHtml(pkg.id) + '">' + escapeHtml(t('automation_delete')) + '</button></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('scene_packages_empty')) + '</p>';
    var failure = dialog.querySelector('[data-scene-failure]');
    failure.innerHTML = '';
    var active = getActiveConv();
    var failed = active && getSceneFailure(active.id);
    if (failed) {
        var failedPackage = getScenePackageById(failed.packageId);
        var failedEvent = failedPackage && getSceneEventById(failedPackage, failed.eventId);
        var row = document.createElement('div');
        row.className = 'feature-inline';
        var note = document.createElement('span');
        note.textContent = t('scene_retry_available')
            .replace('{package}', failedPackage && failedPackage.name || failed.packageId)
            .replace('{event}', failedEvent && failedEvent.name || failed.eventId) +
            (failed.detail ? ' · ' + failed.detail : '');
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = t('automation_retry');
        retry.onclick = async function() {
            retry.disabled = true;
            try {
                await retrySceneFailure(active.id);
                refreshSceneManager();
                hydrateSceneSettings();
            } catch (error) {
                dialog.querySelector('.feature-error').textContent = error.message;
                retry.disabled = false;
            }
        };
        var dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.textContent = t('automation_discard');
        dismiss.onclick = function() { clearSceneFailure(active.id); refreshSceneManager(); };
        row.append(note, retry, dismiss);
        failure.appendChild(row);
    }
    if (failedSceneDraft) {
        var recovery = document.createElement('div');
        recovery.className = 'feature-inline';
        var recoveryNote = document.createElement('span');
        recoveryNote.textContent = t('scene_draft_pending');
        var recoveryRetry = document.createElement('button');
        recoveryRetry.type = 'button';
        recoveryRetry.textContent = t('automation_retry');
        recoveryRetry.onclick = async function() {
            recoveryRetry.disabled = true;
            try {
                var draft = failedSceneDraft;
                failedSceneDraft = null;
                await saveScenePackagesChange(function(candidate) {
                    candidate.scenePackages = JSON.parse(JSON.stringify(draft.candidate.scenePackages));
                    candidate.scenePackageGrants = JSON.parse(JSON.stringify(draft.candidate.scenePackageGrants));
                }, { baseline: draft.baseline });
                refreshSceneManager();
                hydrateSceneSettings();
            } catch (error) {
                dialog.querySelector('.feature-error').textContent = error.message;
                recoveryRetry.disabled = false;
            }
        };
        var recoveryDiscard = document.createElement('button');
        recoveryDiscard.type = 'button';
        recoveryDiscard.textContent = t('automation_discard');
        recoveryDiscard.onclick = function() { failedSceneDraft = null; refreshSceneManager(); };
        recovery.append(recoveryNote, recoveryRetry, recoveryDiscard);
        failure.appendChild(recovery);
    }
    hydrateSceneSettings();
}

async function toggleScenePackageEnabled(packageId, enabled) {
    await saveScenePackagesChange(function(candidate) {
        var pkg = candidate.scenePackages.find(function(item) { return item.id === packageId; });
        if (!pkg) throw new Error(t('scene_package_missing'));
        if (enabled === true && pkg.invalid === true) throw new Error(t('scene_invalid_package'));
        pkg.enabled = enabled === true;
    });
}

async function grantScenePackageLocally(packageId) {
    await saveScenePackagesChange(function(candidate) {
        var pkg = candidate.scenePackages.find(function(item) { return item.id === packageId; });
        if (!pkg) throw new Error(t('scene_package_missing'));
        if (pkg.invalid === true) throw new Error(t('scene_invalid_package'));
        setScenePackageGrant(candidate, pkg.id, pkg.revision, true);
    });
}

async function runOpeningSceneFromManager(dialog) {
    var conv = getActiveConv();
    if (!conv) throw new Error(t('scene_no_conversation'));
    var result = await runSceneOpeningForConversation(conv);
    if (result.executed && getActiveConv() === conv) { renderMessagesOnly(); renderTokenBar(); }
    dialog.querySelector('.feature-error').textContent = '';
    var status = dialog.querySelector('[data-scene-opening-result]');
    if (status) status.textContent = t('scene_opening_result')
        .replace('{executed}', String(result.executed))
        .replace('{skipped}', String(result.skipped))
        .replace('{failed}', String(result.failed));
    refreshSceneManager();
}

function openSceneManager() {
    var dialog = openFeatureDialog('sceneManager', t('scene_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('scene_manager_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-scene-new>' + escapeHtml(t('scene_new')) + '</button>' +
        '<button type="button" data-scene-import>' + escapeHtml(t('automation_import')) + '</button>' +
        '<button type="button" data-scene-export>' + escapeHtml(t('automation_export')) + '</button>' +
        '<button type="button" data-scene-progress>' + escapeHtml(t('scene_progress')) + '</button>' +
        '<button type="button" data-scene-runs>' + escapeHtml(t('automation_runs')) + '</button>' +
        '<button type="button" data-scene-opening>' + escapeHtml(t('scene_run_opening')) + '</button></div>' +
        '<p class="feature-hint" data-scene-opening-note>' + escapeHtml(t('scene_opening_note')) + '</p>' +
        '<p class="feature-hint" data-scene-opening-result></p>' +
        '<div data-scene-failure></div>' +
        '<input id="sceneImportFile" type="file" accept=".json,application/json" hidden>' +
        '<div data-scene-packages></div>', null);
    dialog.addEventListener('click', async function(event) {
        var enabledBox = event.target.closest('[data-scene-enabled]');
        if (enabledBox) {
            try { await toggleScenePackageEnabled(enabledBox.dataset.sceneEnabled, enabledBox.checked); }
            catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
            refreshSceneManager();
            return;
        }
        var button = event.target.closest('button');
        if (!button) return;
        var packages = getScenePackages();
        try {
            if (button.hasAttribute('data-scene-new')) openScenePackageEditor(null);
            if (button.hasAttribute('data-scene-import')) dialog.querySelector('#sceneImportFile').click();
            if (button.hasAttribute('data-scene-export')) downloadJsonFile(exportScenePackagesData(), 'opentavern-scene-packages.json');
            if (button.hasAttribute('data-scene-progress')) openSceneProgress();
            if (button.hasAttribute('data-scene-runs')) openSceneRuns();
            if (button.hasAttribute('data-scene-opening')) {
                button.disabled = true;
                try { await runOpeningSceneFromManager(dialog); } finally { button.disabled = false; }
            }
            if (button.dataset.sceneEdit) openScenePackageEditor(packages.find(function(pkg) { return pkg.id === button.dataset.sceneEdit; }));
            if (button.dataset.sceneGrant) await grantScenePackageLocally(button.dataset.sceneGrant);
            if (button.dataset.scenePreflight) openScenePreflight(packages.find(function(pkg) { return pkg.id === button.dataset.scenePreflight; }));
            if (button.dataset.sceneCopy) {
                var source = packages.find(function(pkg) { return pkg.id === button.dataset.sceneCopy; });
                if (!source) throw new Error(t('scene_package_missing'));
                var copy = cloneScenePackageForCopy(source);
                await saveScenePackagesChange(function(candidate) { candidate.scenePackages.push(copy); });
            }
            if (button.dataset.sceneDelete && await confirmFeatureAction(t('scene_delete_confirm'), t('automation_delete'))) {
                var deleted = button.dataset.sceneDelete;
                await saveScenePackagesChange(function(candidate) {
                    candidate.scenePackages = candidate.scenePackages.filter(function(pkg) { return pkg.id !== deleted; });
                    delete candidate.scenePackageGrants[deleted];
                });
            }
            if (button.dataset.sceneMove) {
                await saveScenePackagesChange(function(candidate) {
                    var from = candidate.scenePackages.findIndex(function(pkg) { return pkg.id === button.dataset.sceneMove; });
                    var to = from + Number(button.dataset.direction);
                    if (from < 0 || to < 0 || to >= candidate.scenePackages.length) return;
                    var moved = candidate.scenePackages.splice(from, 1)[0];
                    candidate.scenePackages.splice(to, 0, moved);
                });
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
        refreshSceneManager();
    });
    dialog.querySelector('#sceneImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            var imported = importScenePackagesData(JSON.parse(await file.text()));
            openSceneImportPreview(imported, dialog);
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    };
    refreshSceneManager();
}

function openSceneImportPreview(packages, manager) {
    var rows = packages.map(function(pkg) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(pkg.name) + '</strong><small>' +
            escapeHtml(sceneScopeLabel(pkg.scope)) + ' · ' + escapeHtml(t('scene_events_count').replace('{count}', String(pkg.events.length))) +
            '</small></span></div>';
    }).join('');
    openFeatureDialog('sceneImportPreview', t('automation_import_preview'),
        '<p class="feature-hint">' + escapeHtml(t('scene_import_note')) + '</p><div>' + rows + '</div>',
        async function() {
            await saveScenePackagesChange(function(candidate) {
                if (candidate.scenePackages.length + packages.length > SCENE_MAX_PACKAGES) throw new Error(t('scene_package_limit'));
                packages.forEach(function(pkg) { candidate.scenePackages.push(JSON.parse(JSON.stringify(pkg))); });
            });
            if (manager) manager.querySelector('.feature-error').textContent = '';
            refreshSceneManager();
        }, { saveLabel: t('automation_import_apply') });
}

function openSceneConditionEditor(condition, onSave) {
    var working = condition ? JSON.parse(JSON.stringify(condition)) : {
        id: makeId(), source: 'message-count', op: 'gte', path: '', valueType: 'number', value: 2
    };
    var dialog = openFeatureDialog('sceneConditionEditor', condition ? t('automation_edit_condition') : t('automation_add_condition'),
        featureSelect(t('automation_condition_source'), 'sceneConditionSource', working.source, SCENE_CONDITION_SOURCES.map(function(source) { return [source, sceneConditionSourceLabel(source)]; })) +
        featureSelect(t('automation_operator'), 'sceneConditionOp', working.op, AUTOMATION_CONDITION_OPS.map(function(op) { return [op, automationOpLabel(op)]; })) +
        '<div data-scene-condition-fields></div>', async function(editor) {
            working.source = editor.querySelector('#sceneConditionSource').value;
            working.op = editor.querySelector('#sceneConditionOp').value;
            var path = editor.querySelector('#sceneConditionPath');
            var valueType = editor.querySelector('#sceneConditionValueType');
            var value = editor.querySelector('#sceneConditionValue');
            var booleanValue = editor.querySelector('#sceneConditionBoolean');
            working.path = path ? path.value.trim() : '';
            working.valueType = valueType ? valueType.value : 'string';
            if (working.source === 'message-count' || working.source === 'away-minutes') working.valueType = 'number';
            else if (working.source !== 'mvu') working.valueType = 'string';
            if (working.source === 'mvu') validateAutomationPath(working.path);
            if (working.valueType === 'boolean' && booleanValue) working.value = booleanValue.value === 'true';
            else if (working.valueType === 'number') {
                var numericText = value ? value.value.trim() : '';
                var numeric = Number(numericText);
                if (!numericText || !Number.isFinite(numeric) || working.source === 'away-minutes' && numeric < 0) throw new Error(t('automation_value_invalid'));
                working.value = numeric;
            } else working.value = value ? value.value : '';
            if (!sceneConditionInputValid(working)) throw new Error(t('scene_conditions_invalid'));
            onSave(working);
        }, { lockWhileSaving: true });
    function renderFields() {
        var host = dialog.querySelector('[data-scene-condition-fields]');
        var source = dialog.querySelector('#sceneConditionSource').value;
        var op = dialog.querySelector('#sceneConditionOp').value;
        if (source === 'mvu') {
            host.innerHTML = featureField(t('automation_path'), 'sceneConditionPath', working.path) +
                featureSelect(t('automation_value_type'), 'sceneConditionValueType', working.valueType, AUTOMATION_VALUE_TYPES.map(function(type) { return [type, automationValueTypeLabel(type)]; })) +
                '<div data-scene-condition-value></div>';
            renderValue();
        } else if (source === 'message-count' || source === 'away-minutes') {
            host.innerHTML = featureField(t('automation_value'), 'sceneConditionValue', working.value, 'number', 'step="1" min="0"') +
                '<p class="feature-hint">' + escapeHtml(source === 'away-minutes' ? t('scene_away_hint') : t('scene_count_hint')) + '</p>';
        } else if (source === 'event-role') {
            host.innerHTML = featureSelect(t('automation_value'), 'sceneConditionValue', working.value, [['user', 'user'], ['assistant', 'assistant'], ['', t('automation_any')]]);
        } else {
            host.innerHTML = featureField(t('automation_value'), 'sceneConditionValue', working.value);
        }
        if (['exists', 'not-exists'].indexOf(op) >= 0) {
            var valueHost = host.querySelector('[data-scene-condition-value]');
            if (valueHost) valueHost.innerHTML = '';
        }
    }
    function renderValue() {
        var host = dialog.querySelector('[data-scene-condition-value]');
        if (!host) return;
        var type = dialog.querySelector('#sceneConditionValueType');
        if (type && type.value === 'boolean') {
            host.innerHTML = featureSelect(t('automation_value'), 'sceneConditionBoolean', working.value === true ? 'true' : 'false', [['true', t('automation_true')], ['false', t('automation_false')]]);
        } else {
            host.innerHTML = featureField(t('automation_value'), 'sceneConditionValue', working.value, type && type.value === 'number' ? 'number' : 'text');
        }
    }
    dialog.querySelector('#sceneConditionSource').onchange = renderFields;
    dialog.querySelector('#sceneConditionOp').onchange = renderFields;
    dialog.addEventListener('change', function(event) {
        if (event.target && event.target.id === 'sceneConditionValueType') {
            working.valueType = event.target.value;
            renderValue();
        }
    });
    renderFields();
}

function openSceneMvuChangeEditor(change, onSave) {
    var working = change ? JSON.parse(JSON.stringify(change)) : { id: makeId(), path: '', valueType: 'string', value: '' };
    var dialog = openFeatureDialog('sceneMvuChangeEditor', change ? t('scene_edit_mvu') : t('scene_add_mvu'),
        featureField(t('automation_path'), 'sceneMvuPath', working.path) +
        featureSelect(t('automation_value_type'), 'sceneMvuValueType', working.valueType, AUTOMATION_VALUE_TYPES.map(function(type) { return [type, automationValueTypeLabel(type)]; })) +
        featureField(t('automation_value'), 'sceneMvuValue', working.value), async function(editor) {
            working.path = editor.querySelector('#sceneMvuPath').value.trim();
            working.valueType = editor.querySelector('#sceneMvuValueType').value;
            var rawValue = editor.querySelector('#sceneMvuValue').value;
            validateAutomationPath(working.path);
            if (working.valueType === 'number') {
                var numericText = rawValue.trim();
                var numeric = Number(numericText);
                if (!numericText || !Number.isFinite(numeric)) throw new Error(t('automation_value_invalid'));
                working.value = numeric;
            } else if (working.valueType === 'boolean') {
                if (rawValue !== 'true' && rawValue !== 'false') throw new Error(t('automation_value_invalid'));
                working.value = rawValue === 'true';
            } else {
                if (!rawValue.trim()) throw new Error(t('automation_value_invalid'));
                working.value = rawValue;
            }
            if (!sceneMvuChangeInputValid(working)) throw new Error(t('scene_mvu_invalid'));
            onSave(working);
        }, { lockWhileSaving: true });
}

function openSceneEventEditor(event, onSave) {
    var working = event ? JSON.parse(JSON.stringify(event)) : {
        id: makeId(), revision: 0, name: '', order: 0, trigger: 'opening', once: true, conditions: [], text: '', mvu: []
    };
    var dialog = openFeatureDialog('sceneEventEditor', event ? t('automation_edit') : t('scene_add_event'),
        featureField(t('scene_event_name'), 'sceneEventName', working.name) +
        featureSelect(t('scene_trigger'), 'sceneEventTrigger', working.trigger, SCENE_TRIGGERS.map(function(trigger) { return [trigger, sceneTriggerLabel(trigger)]; })) +
        '<label class="feature-check"><input id="sceneEventOnce" type="checkbox"' + (working.once !== false ? ' checked' : '') + '>' + escapeHtml(t('scene_once')) + '</label>' +
        featureField(t('scene_text'), 'sceneEventText', working.text, 'textarea', 'rows="6" maxlength="' + SCENE_MAX_TEXT + '"') +
        '<h3 class="feature-section-title">' + escapeHtml(t('automation_conditions')) + '</h3><div data-scene-event-conditions></div>' +
        '<div class="feature-toolbar"><button type="button" data-scene-add-condition>' + escapeHtml(t('automation_add_condition')) + '</button></div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('scene_mvu_changes')) + '</h3><div data-scene-event-mvu></div>' +
        '<div class="feature-toolbar"><button type="button" data-scene-add-mvu>' + escapeHtml(t('scene_add_mvu')) + '</button></div>' +
        '<p class="feature-hint">' + escapeHtml(t('scene_once_hint')) + '</p>', async function(editor) {
            working.name = editor.querySelector('#sceneEventName').value.trim();
            if (!working.name) throw new Error(t('scene_event_name_required'));
            working.trigger = editor.querySelector('#sceneEventTrigger').value;
            working.once = editor.querySelector('#sceneEventOnce').checked;
            working.text = editor.querySelector('#sceneEventText').value;
            if (!working.text.trim()) throw new Error(t('scene_event_text_required'));
            working.revision = (Number(working.revision) || 0) + 1;
            delete working.invalid;
            validateScenePackage({ id: 'scene-validation', name: 'validation', enabled: false, scope: 'global', targetId: '', revision: 0, order: 0, events: [working] });
            onSave(working);
        }, { lockWhileSaving: true });
    function renderConditions() {
        dialog.querySelector('[data-scene-event-conditions]').innerHTML = working.conditions.map(function(condition, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(sceneConditionSourceLabel(condition.source)) + ' ' +
                escapeHtml(automationOpLabel(condition.op)) + '</strong><small>' +
                escapeHtml(condition.source === 'mvu' ? condition.path + ' = ' + condition.value : sceneConditionValueText(condition)) + '</small></span>' +
                '<button type="button" data-scene-condition-edit="' + index + '">' + escapeHtml(t('automation_edit')) + '</button>' +
                '<button type="button" data-scene-condition-delete="' + index + '">' + escapeHtml(t('automation_remove')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_no_conditions')) + '</p>';
    }
    function renderMvu() {
        dialog.querySelector('[data-scene-event-mvu]').innerHTML = working.mvu.map(function(change, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(change.path) + '</strong><small>' +
                escapeHtml(automationValueTypeLabel(change.valueType) + ' · ' + String(change.value)) + '</small></span>' +
                '<button type="button" data-scene-mvu-edit="' + index + '">' + escapeHtml(t('automation_edit')) + '</button>' +
                '<button type="button" data-scene-mvu-delete="' + index + '">' + escapeHtml(t('automation_remove')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('scene_no_mvu')) + '</p>';
    }
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-scene-add-condition')) {
            openSceneConditionEditor(null, function(created) { working.conditions.push(created); renderConditions(); });
        }
        if (button.dataset.sceneConditionEdit != null) {
            var conditionIndex = Number(button.dataset.sceneConditionEdit);
            openSceneConditionEditor(working.conditions[conditionIndex], function(updated) { working.conditions[conditionIndex] = updated; renderConditions(); });
        }
        if (button.dataset.sceneConditionDelete != null) {
            working.conditions.splice(Number(button.dataset.sceneConditionDelete), 1);
            renderConditions();
        }
        if (button.hasAttribute('data-scene-add-mvu')) {
            openSceneMvuChangeEditor(null, function(created) { working.mvu.push(created); renderMvu(); });
        }
        if (button.dataset.sceneMvuEdit != null) {
            var mvuIndex = Number(button.dataset.sceneMvuEdit);
            openSceneMvuChangeEditor(working.mvu[mvuIndex], function(updated) { working.mvu[mvuIndex] = updated; renderMvu(); });
        }
        if (button.dataset.sceneMvuDelete != null) {
            working.mvu.splice(Number(button.dataset.sceneMvuDelete), 1);
            renderMvu();
        }
    });
    renderConditions();
    renderMvu();
}

function openScenePackageEditor(pkg) {
    var isNew = !pkg;
    var working = pkg ? JSON.parse(JSON.stringify(pkg)) : {
        id: makeId(), revision: 0, name: '', enabled: false, scope: 'global', targetId: '',
        order: (state.settings.scenePackages || []).length, events: []
    };
    var granted = isNew || isScenePackageAuthorized(pkg);
    var dialog = openFeatureDialog('scenePackageEditor', isNew ? t('scene_new') : t('automation_edit'),
        featureField(t('scene_package_name'), 'scenePackageName', working.name) +
        featureSelect(t('automation_scope'), 'scenePackageScope', working.scope, SCENE_SCOPES.map(function(scope) { return [scope, sceneScopeLabel(scope)]; })) +
        '<div data-scene-package-target></div>' +
        '<label class="feature-check"><input id="scenePackageEnabled" type="checkbox"' + (working.enabled ? ' checked' : '') + '>' + escapeHtml(t('automation_enabled')) + '</label>' +
        '<label class="feature-check"><input id="scenePackageGranted" type="checkbox"' + (granted ? ' checked' : '') + '>' + escapeHtml(t('scene_grant')) + '</label>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('scene_events')) + '</h3><div data-scene-package-events></div>' +
        '<div class="feature-toolbar"><button type="button" data-scene-add-event>' + escapeHtml(t('scene_add_event')) + '</button></div>' +
        '<p class="feature-hint">' + escapeHtml(t('scene_grant_hint')) + '</p>', async function(editor) {
            working.name = editor.querySelector('#scenePackageName').value.trim();
            if (!working.name) throw new Error(t('scene_name_required'));
            working.scope = normalizeSceneScope(editor.querySelector('#scenePackageScope').value);
            var target = editor.querySelector('#scenePackageTarget');
            working.targetId = working.scope === 'global' ? '' : target && target.value || '';
            working.enabled = editor.querySelector('#scenePackageEnabled').checked;
            granted = editor.querySelector('#scenePackageGranted').checked;
            delete working.invalid;
            validateScenePackage(working);
            working.revision = bumpScenePackageRevision(working);
            await saveScenePackagesChange(function(candidate) {
                var index = candidate.scenePackages.findIndex(function(item) { return item.id === working.id; });
                if (index >= 0) candidate.scenePackages[index] = JSON.parse(JSON.stringify(working));
                else candidate.scenePackages.push(JSON.parse(JSON.stringify(working)));
                if (granted) setScenePackageGrant(candidate, working.id, working.revision, true);
                else delete candidate.scenePackageGrants[working.id];
            });
            refreshSceneManager();
            hydrateSceneSettings();
        }, { lockWhileSaving: true });
    function renderTarget() {
        var host = dialog.querySelector('[data-scene-package-target]');
        var scope = normalizeSceneScope(dialog.querySelector('#scenePackageScope').value);
        if (scope === 'global') { host.innerHTML = ''; return; }
        var choices = sceneTargetChoices(scope);
        if (working.targetId && !choices.some(function(item) { return item[0] === working.targetId; })) choices.unshift([working.targetId, working.targetId]);
        host.innerHTML = featureSelect(scope === 'character' ? t('automation_target_character') : t('automation_target_conversation'),
            'scenePackageTarget', working.targetId, choices);
    }
    function renderEvents() {
        dialog.querySelector('[data-scene-package-events]').innerHTML = working.events.map(function(event, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(event.name) + '</strong><small>' +
                escapeHtml(sceneTriggerLabel(event.trigger)) + ' · ' + escapeHtml(event.once !== false ? t('scene_once') : t('scene_repeatable')) +
                '</small></span>' +
                '<button type="button" data-scene-event-edit="' + index + '">' + escapeHtml(t('automation_edit')) + '</button>' +
                '<button type="button" data-scene-event-move="' + index + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>' + escapeHtml(t('automation_up')) + '</button>' +
                '<button type="button" data-scene-event-move="' + index + '" data-direction="1"' + (index === working.events.length - 1 ? ' disabled' : '') + '>' + escapeHtml(t('automation_down')) + '</button>' +
                '<button type="button" data-scene-event-delete="' + index + '">' + escapeHtml(t('automation_remove')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('scene_events_empty')) + '</p>';
    }
    dialog.querySelector('#scenePackageScope').onchange = renderTarget;
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-scene-add-event')) {
            openSceneEventEditor(null, function(created) {
                created.order = working.events.length;
                working.events.push(created);
                renderEvents();
            });
        }
        if (button.dataset.sceneEventEdit != null) {
            var editIndex = Number(button.dataset.sceneEventEdit);
            openSceneEventEditor(working.events[editIndex], function(updated) {
                updated.order = editIndex;
                working.events[editIndex] = updated;
                renderEvents();
            });
        }
        if (button.dataset.sceneEventDelete != null) {
            working.events.splice(Number(button.dataset.sceneEventDelete), 1);
            working.events.forEach(function(item, index) { item.order = index; });
            renderEvents();
        }
        if (button.dataset.sceneEventMove) {
            var from = Number(button.dataset.sceneEventMove);
            var to = from + Number(button.dataset.direction);
            if (to >= 0 && to < working.events.length) {
                var moved = working.events.splice(from, 1)[0];
                working.events.splice(to, 0, moved);
                working.events.forEach(function(item, index) { item.order = index; });
                renderEvents();
            }
        }
    });
    renderTarget();
    renderEvents();
}

function scenePreflightPayload(trigger, conv) {
    if (!conv) return null;
    if (trigger === 'opening') {
        var first = (conv.messages || []).find(function(message) { return message.role === 'user'; });
        return first
            ? { eventId: 'scene-preflight', role: 'user', text: first.content, messageId: first.id, messageRevision: getMessageRevision(first) }
            : { eventId: 'scene-preflight', role: 'user', text: '', sceneOpening: true };
    }
    if (trigger === 'user-message-saved') {
        var user = (conv.messages || []).slice().reverse().find(function(message) { return message.role === 'user'; });
        return user ? { eventId: 'scene-preflight', role: 'user', text: user.content, messageId: user.id, messageRevision: getMessageRevision(user) } : null;
    }
    var assistant = (conv.messages || []).slice().reverse().find(function(message) { return message.role === 'assistant' && message.stage !== 'second' && message.stage !== 'scene'; });
    return assistant ? { eventId: 'scene-preflight', role: 'assistant', text: assistant.content, messageId: assistant.id, messageRevision: getMessageRevision(assistant) } : null;
}

function openScenePreflight(pkg) {
    if (!pkg) return;
    var conv = getActiveConv();
    var rows = (pkg.events || []).slice().sort(function(a, b) { return a.order - b.order; }).map(function(event) {
        var payload = scenePreflightPayload(event.trigger, conv);
        var reasonRows = [];
        var status = '';
        if (!payload) {
            status = t('scene_preflight_waiting');
        } else {
            var context = buildSceneEventContext(conv, event.trigger, payload);
            var evaluated = evaluateSceneConditions(event.conditions, context);
            reasonRows = evaluated.reasons.map(function(reason) {
                var condition = event.conditions.find(function(item) { return item.id === reason.id; });
                var conditionText = condition ? sceneConditionSourceLabel(condition.source) + ' ' + automationOpLabel(condition.op) : reason.source;
                if (condition && condition.source === 'event-role') conditionText += ' ' + sceneConditionValueText(condition);
                return '<div class="feature-row"><span>' + escapeHtml(conditionText) +
                    '</span><small>' + escapeHtml(reason.matched ? t('automation_result_matched') : t('automation_result_skipped') + ' · ' + reason.reason) + '</small></div>';
            });
            status = evaluated.matched ? t('scene_preflight_matched') : t('scene_preflight_unmatched');
            if (event.once === true && sceneOnceTriggered(conv, pkg.id, event.id)) status += ' · ' + t('scene_already_triggered');
            if (!isScenePackageAuthorized(pkg)) status += ' · ' + t('scene_not_authorized');
            if (pkg.enabled === false || !scenePackageMatchesConversation(pkg, conv)) status += ' · ' + t('scene_not_bound');
        }
        var mvuRows = event.mvu.map(function(change) {
            return '<div class="feature-row"><span>' + escapeHtml(change.path) + '</span><small>' +
                escapeHtml(automationValueTypeLabel(change.valueType) + ' · ' + String(change.value)) + '</small></div>';
        }).join('');
        return '<div class="feature-row"><span><strong>' + escapeHtml(event.name) + '</strong><small>' +
            escapeHtml(sceneTriggerLabel(event.trigger) + ' · ' + status) + '</small></span></div>' +
            '<div class="feature-greeting-preview">' + escapeHtml(event.text) + '</div>' +
            reasonRows +
            (mvuRows ? '<h3 class="feature-section-title">' + escapeHtml(t('scene_mvu_changes')) + '</h3>' + mvuRows : '');
    }).join('');
    openFeatureDialog('scenePreflight', t('scene_preflight_title'),
        '<p class="feature-hint">' + escapeHtml(t('scene_preflight_hint')) + '</p>' + (rows || '<p class="feature-hint">' + escapeHtml(t('scene_events_empty')) + '</p>'), null);
}

function openSceneProgress() {
    var conv = getActiveConv();
    if (!conv) {
        alert(t('scene_no_conversation'));
        return;
    }
    var entries = getSceneProgress(conv);
    var rows = entries.map(function(entry) {
        var mvu = entry.mvuChanges.map(function(change) {
            return change.path + ' = ' + String(change.value);
        }).join(' · ');
        return '<div class="feature-row"><span><strong>' + escapeHtml(entry.eventName) + '</strong><small>' +
            escapeHtml(entry.packageName + ' · ' + sceneTriggerLabel(entry.trigger) + ' · ' + new Date(entry.at || Date.now()).toLocaleString() +
                ' · ' + entry.sourceMessageId) + (mvu ? ' · ' + mvu : '') + '</small></span></div>' +
            '<div class="feature-greeting-preview">' + escapeHtml(entry.text) + '</div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('scene_progress_empty')) + '</p>';
    var runs = getSceneRecentRuns().filter(function(entry) { return entry.conversationId === conv.id; }).map(function(entry) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(entry.eventName || entry.eventId) + '</strong><small>' +
            escapeHtml(entry.status + ' · ' + entry.detail) + '</small></span></div>';
    }).join('');
    openFeatureDialog('sceneProgress', t('scene_progress_title'),
        '<p class="feature-hint">' + escapeHtml(t('scene_progress_hint')) + '</p>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('scene_progress')) + '</h3>' + rows +
        '<h3 class="feature-section-title">' + escapeHtml(t('scene_run_reasons')) + '</h3>' +
        (runs || '<p class="feature-hint">' + escapeHtml(t('automation_runs_empty')) + '</p>'), null);
}

function openSceneRuns() {
    var runs = getSceneRecentRuns();
    var rows = runs.map(function(entry) {
        var conditions = (entry.conditions || []).map(function(item) {
            return escapeHtml(sceneConditionSourceLabel(item.source) + ' ' + automationOpLabel(item.op) + ' · ' +
                (item.matched ? t('automation_result_matched') : t('automation_result_skipped')));
        }).join('<br>');
        return '<div class="feature-row"><span><strong>' + escapeHtml(entry.packageName + ' · ' + entry.eventName) + '</strong><small>' +
            escapeHtml(new Date(entry.at).toLocaleString() + ' · ' + sceneTriggerLabel(entry.trigger) + ' · ' + entry.status +
                (entry.detail ? ' · ' + entry.detail : '')) + '</small>' + (conditions ? '<small>' + conditions + '</small>' : '') + '</span></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('automation_runs_empty')) + '</p>';
    openFeatureDialog('sceneRuns', t('automation_runs_title'), rows, null);
}
