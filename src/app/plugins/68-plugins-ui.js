/**
 * 新手导读（文件：68-plugins-ui.js）
 *
 * 负责什么：通用插件的二级管理界面——导入预览、安装、能力授权、启用/停止、更新差异、
 * 回退、卸载、私有数据导出和明确清除。
 * 在程序中的位置：入口在设置“扩展”面板；真正的执行、隔离和 RPC 在 50-plugin-runtime.js。
 * 从哪里开始看：`hydratePluginSettings()`、`openPluginManager()`、`openPluginImportPreview(record, dialog, updateId)`。
 * 修改时注意：插件文字一律作为纯文本转义；导入/同步/恢复不授予执行许可，也不自动运行。
 */
// ==================== Plugin UI ====================
function pluginCapabilityLabel(capability) {
    var key = 'plugin_capability_' + String(capability || '').replace(/\./g, '_');
    return t(key);
}

function pluginCapabilityList(record) {
    return (record.capabilities || []).length
        ? record.capabilities.map(pluginCapabilityLabel).join(' · ')
        : t('plugin_none');
}

function pluginStatusLabel(status) {
    var map = {
        running: t('plugin_status_running'),
        starting: t('plugin_status_starting'),
        stopped: t('plugin_status_stopped'),
        failed: t('plugin_status_failed')
    };
    return map[status] || t('plugin_status_stopped');
}

function pluginNetworkText(record) {
    if (!(record.network || []).length) return t('plugin_none');
    return record.network.map(function(rule) { return rule.origin + ' [' + rule.methods.join(', ') + ']'; }).join(' · ');
}

function pluginRecordSummary(record) {
    var parts = [
        t('plugin_version') + ' ' + record.version,
        record.source,
        record.digest.slice(0, 19) + '…'
    ];
    return parts.join(' · ');
}

function pluginOutputHtml(pluginId) {
    var display = pluginRuntimeDisplayFor(pluginId);
    if (!display) return '';
    var actions = (display.actions || []).map(function(action) {
        return '<button type="button" data-plugin-action="' + escapeHtml(action.id) + '" data-plugin-action-target="' + escapeHtml(pluginId) + '">' +
            escapeHtml(action.label) + '</button>';
    }).join('');
    return '<div class="plugin-output">' +
        (display.title ? '<strong>' + escapeHtml(display.title) + '</strong>' : '') +
        '<p class="plugin-output-text">' + escapeHtml(display.text) + '</p>' +
        (actions ? '<div class="feature-toolbar">' + actions + '</div>' : '') +
        '</div>';
}

function hydratePluginSettings() {
    var button = document.getElementById('pluginManageBtn');
    if (button) {
        button.onclick = openPluginManager;
        button.textContent = t('plugin_manage');
    }
    var plugins = getInstalledPlugins();
    var running = plugins.filter(function(record) { return pluginRuntimeIsRunning(record.id); }).length;
    var status = document.getElementById('pluginSettingsStatus');
    if (status) {
        status.textContent = t('plugin_status_summary')
            .replace('{count}', String(plugins.length))
            .replace('{running}', String(running));
    }
    var host = document.querySelector('[data-plugin-output]');
    if (host) {
        host.innerHTML = running
            ? plugins.filter(function(record) { return pluginRuntimeIsRunning(record.id); }).map(function(record) {
                return pluginOutputHtml(record.id);
            }).join('')
            : '<p class="feature-hint">' + escapeHtml(t('plugin_no_output')) + '</p>';
        host.onclick = function(event) {
            var button = event.target.closest('button');
            if (!button || !button.dataset.pluginAction || !button.dataset.pluginActionTarget) return;
            try { pluginRuntimeTriggerAction(button.dataset.pluginActionTarget, button.dataset.pluginAction); }
            catch (error) { if (status) status.textContent = error.message || String(error); }
        };
    }
    var detail = document.getElementById('pluginManager');
    if (detail) refreshPluginManager();
}

function refreshPluginManager() {
    var dialog = document.getElementById('pluginManager');
    if (!dialog) return;
    var list = dialog.querySelector('[data-plugin-list]');
    var dataList = dialog.querySelector('[data-plugin-data-list]');
    if (!list || !dataList) return;
    var plugins = getInstalledPlugins();
    list.innerHTML = (typeof failedPluginDraft !== 'undefined' && failedPluginDraft
        ? '<div class="feature-toolbar"><button type="button" data-plugin-retry>' + escapeHtml(t('plugin_retry')) + '</button><span class="feature-hint">' + escapeHtml(t('plugin_retry_hint')) + '</span></div>'
        : '') + (plugins.length ? plugins.map(pluginManagerRow).join('') : '<p class="feature-hint">' + escapeHtml(t('plugin_empty_list')) + '</p>');
    var dataIds = pluginPrivateDataIds();
    dataList.innerHTML = dataIds.length ? dataIds.map(function(id) {
        var installed = getInstalledPluginById(id);
        var data = pluginPrivateDataFor(state.settings, id);
        return '<div class="feature-row"><span><strong>' + escapeHtml(installed ? installed.name : id) + '</strong><small>' +
            escapeHtml(id + ' · ' + (installed ? t('plugin_data_installed') : t('plugin_data_orphaned')) + ' · ' + pluginFormatBytes(pluginTextBytes(JSON.stringify(data)))) +
            '</small></span><button type="button" data-plugin-export-data="' + escapeHtml(id) + '">' + escapeHtml(t('plugin_export_data')) + '</button>' +
            '<button type="button" data-plugin-clear-data="' + escapeHtml(id) + '">' + escapeHtml(t('plugin_clear_data')) + '</button></div>';
    }).join('') : '<p class="feature-hint">' + escapeHtml(t('plugin_data_none')) + '</p>';
}

function pluginManagerRow(record) {
    var pluginId = record.id;
    var granted = isPluginGranted(record, getPluginGrant(pluginId));
    var running = pluginRuntimeIsRunning(pluginId);
    var status = pluginRuntimeStatusFor(pluginId);
    var statusText = pluginStatusLabel(status);
    var statusMessage = pluginRuntimeStatusMessage(pluginId);
    var output = pluginOutputHtml(pluginId);
    return '<div class="feature-row plugin-row" data-plugin-row="' + escapeHtml(pluginId) + '"><div class="plugin-row-text"><strong>' + escapeHtml(record.name) +
        '</strong><small>' + escapeHtml(pluginRecordSummary(record)) + '</small><small>' +
        escapeHtml(t('plugin_status') + ' ' + statusText + (statusMessage ? ' · ' + statusMessage : '') + ' · ' + (granted ? t('plugin_granted') : t('plugin_not_authorized'))) +
        '</small><small>' + escapeHtml(t('plugin_capabilities') + ': ' + pluginCapabilityList(record)) + '</small>' +
        (record.network && record.network.length ? '<small>' + escapeHtml(t('plugin_network') + ': ' + pluginNetworkText(record)) + '</small>' : '') +
        (record.dependencies && record.dependencies.length ? '<small>' + escapeHtml(t('plugin_dependencies') + ': ' + record.dependencies.map(function(dependency) { return dependency.id + '@' + dependency.version; }).join(', ')) + '</small>' : '') +
        (output || '') + '</div>' +
        (granted ? '<button type="button" data-plugin-revoke="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_revoke')) + '</button>'
            : '<button type="button" data-plugin-grant="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_authorize')) + '</button>') +
        (running ? '<button type="button" data-plugin-stop="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_disable')) + '</button>'
            : '<button type="button" data-plugin-enable="' + escapeHtml(pluginId) + '"' + (granted ? '' : ' disabled') + '>' + escapeHtml(t('plugin_enable')) + '</button>') +
        '<button type="button" data-plugin-update="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_update')) + '</button>' +
        (record.previous ? '<button type="button" data-plugin-rollback="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_rollback')) + '</button>' : '') +
        '<button type="button" data-plugin-uninstall="' + escapeHtml(pluginId) + '">' + escapeHtml(t('plugin_uninstall')) + '</button>' +
        '</div>';
}

function pluginImportPreviewBody(record, updateId) {
    var installed = updateId ? getInstalledPluginById(updateId) : null;
    var rows = [
        [t('plugin_id'), record.id],
        [t('plugin_name'), record.name],
        [t('plugin_version'), record.version],
        [t('plugin_schema'), String(record.schemaVersion)],
        [t('plugin_source'), record.source],
        [t('plugin_digest'), record.digest],
        [t('plugin_entry_bytes'), pluginFormatBytes(pluginTextBytes(record.entry.code))],
        [t('plugin_resources'), (record.resources || []).length ? record.resources.map(function(resource) { return resource.path + ' · ' + pluginFormatBytes(pluginTextBytes(resource.text)); }).join(', ') : t('plugin_none')],
        [t('plugin_capabilities'), pluginCapabilityList(record)],
        [t('plugin_dependencies'), (record.dependencies || []).length ? record.dependencies.map(function(dependency) { return dependency.id + '@' + dependency.version; }).join(', ') : t('plugin_none')],
        [t('plugin_network'), pluginNetworkText(record)]
    ];
    var diff = installed ? pluginDiffSummary(installed, record) : [];
    return '<p class="feature-hint">' + escapeHtml(t('plugin_import_preview_hint')) + '</p>' +
        (record.description ? '<p class="feature-hint">' + escapeHtml(record.description) + '</p>' : '') +
        rows.map(function(row) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(row[0]) + '</strong><small>' + escapeHtml(String(row[1])) + '</small></span></div>';
        }).join('') +
        (installed ? '<h3 class="feature-section-title">' + escapeHtml(t('plugin_update_diff')) + '</h3><div>' +
            (diff.length ? diff.map(function(line) { return '<div class="feature-row"><span><small>' + escapeHtml(line) + '</small></span></div>'; }).join('')
                : '<p class="feature-hint">' + escapeHtml(t('plugin_diff_none')) + '</p>') + '</div>' : '') +
        '<p class="feature-hint">' + escapeHtml(t('plugin_import_stays_stopped')) + '</p>';
}

function openPluginImportPreview(record, manager, updateId) {
    var installed = updateId ? getInstalledPluginById(updateId) : getInstalledPluginById(record.id);
    if (updateId && (!installed || record.id !== updateId)) {
        manager.querySelector('.feature-error').textContent = t('plugin_update_id_mismatch');
        return;
    }
    if (!updateId && installed) {
        manager.querySelector('.feature-error').textContent = t('plugin_already_installed');
        return;
    }
    if (updateId && pluginVersionCompare(record.version, installed.version) <= 0) {
        manager.querySelector('.feature-error').textContent = t('plugin_update_requires_version');
        return;
    }
    var dialog = openFeatureDialog('pluginImportPreview', updateId ? t('plugin_update_preview_title') : t('plugin_import_preview_title'),
        pluginImportPreviewBody(record, updateId), async function() {
            if (updateId) await pluginApplyUpdate(installed, record);
            else await pluginApplyInstall(record);
            refreshPluginManager();
        }, { saveLabel: updateId ? t('plugin_install_update') : t('plugin_install') });
    dialog.addEventListener('close', function() { refreshPluginManager(); });
    return dialog;
}

async function pluginApplyInstall(record) {
    var installed = pluginInstalledRecordFromPackage(record);
    await savePluginSettingsChange(function(candidate) {
        if (candidate.plugins.some(function(item) { return item.id === installed.id; })) throw new Error(t('plugin_already_installed'));
        candidate.plugins.push(installed);
        clearPluginGrant(candidate, installed.id);
    });
    clearPluginRuntimeStatus(installed.id);
}

async function pluginApplyUpdate(installed, record) {
    var current = getInstalledPluginById(installed.id);
    if (!current || pluginFingerprint(current) !== pluginFingerprint(installed)) throw new Error(t('plugin_settings_changed'));
    var baseline = pluginSettingsSnapshot();
    var candidate = pluginInstalledRecordFromPackage(record);
    candidate.installedAt = installed.installedAt;
    candidate.updatedAt = Date.now();
    candidate.previous = pluginSnapshotForRollback(installed);
    var probe = await beginPluginProbe(candidate);
    try {
        await savePluginSettingsChange(function(settingsCandidate) {
            var index = settingsCandidate.plugins.findIndex(function(item) { return item.id === installed.id; });
            if (index < 0) throw new Error(t('plugin_missing'));
            settingsCandidate.plugins[index] = JSON.parse(JSON.stringify(candidate));
            clearPluginGrant(settingsCandidate, installed.id);
        }, { baseline: baseline });
    } catch (error) {
        probe.stop();
        throw error;
    }
    probe.stop();
    stopPluginInstance(installed.id, t('plugin_updated_stopped'), { skipDependents: false });
    pluginRuntimeNotifyUi();
}

async function pluginRollback(installed) {
    if (!installed || !installed.previous) throw new Error(t('plugin_rollback_missing'));
    var current = getInstalledPluginById(installed.id);
    if (!current || pluginFingerprint(current) !== pluginFingerprint(installed)) throw new Error(t('plugin_settings_changed'));
    var baseline = pluginSettingsSnapshot();
    var restored = pluginRecordFromPrevious(installed.previous, installed.id, installed.installedAt);
    restored.previous = pluginSnapshotForRollback(installed);
    var probe = await beginPluginProbe(restored);
    try {
        await savePluginSettingsChange(function(candidate) {
            var index = candidate.plugins.findIndex(function(item) { return item.id === installed.id; });
            if (index < 0) throw new Error(t('plugin_missing'));
            candidate.plugins[index] = JSON.parse(JSON.stringify(restored));
            clearPluginGrant(candidate, installed.id);
        }, { baseline: baseline });
    } catch (error) {
        probe.stop();
        throw error;
    }
    probe.stop();
    stopPluginInstance(installed.id, t('plugin_rolled_back_stopped'), { skipDependents: false });
    pluginRuntimeNotifyUi();
}

async function pluginUninstall(installed) {
    if (!installed) throw new Error(t('plugin_missing'));
    stopPluginInstance(installed.id, t('plugin_uninstalled'), { skipDependents: false });
    await savePluginSettingsChange(function(candidate) {
        candidate.plugins = candidate.plugins.filter(function(item) { return item.id !== installed.id; });
        clearPluginGrant(candidate, installed.id);
    });
    clearPluginRuntimeStatus(installed.id);
    pluginRuntimeNotifyUi();
}

async function pluginClearPrivateData(pluginId) {
    stopPluginInstance(pluginId, t('plugin_data_cleared'), { skipDependents: false });
    await savePluginSettingsChange(function(candidate) {
        if (!candidate.pluginPrivateData || !Object.prototype.hasOwnProperty.call(candidate.pluginPrivateData, pluginId)) return;
        delete candidate.pluginPrivateData[pluginId];
    });
    pluginRuntimeNotifyUi();
}

async function pluginGrantCapabilities(installed, capabilities) {
    if (!installed) throw new Error(t('plugin_missing'));
    var reviewedFingerprint = pluginFingerprint(installed);
    var reviewedCapabilities = (installed.capabilities || []).slice();
    var current = getInstalledPluginById(installed.id);
    if (!current || pluginFingerprint(current) !== reviewedFingerprint) throw new Error(t('plugin_settings_changed'));
    (Array.isArray(capabilities) ? capabilities : []).forEach(function(capability) {
        if (reviewedCapabilities.indexOf(capability) < 0) throw new Error(t('plugin_grant_invalid'));
    });
    stopPluginInstance(installed.id, t('plugin_grant_changed'), { skipDependents: false });
    await savePluginSettingsChange(function(candidate) {
        var record = candidate.plugins.find(function(item) { return item.id === installed.id; });
        if (!record) throw new Error(t('plugin_missing'));
        if (pluginFingerprint(record) !== reviewedFingerprint) throw new Error(t('plugin_settings_changed'));
        setPluginGrant(candidate, record, capabilities);
    }, {
        afterPersist: function() {
            var live = getInstalledPluginById(installed.id);
            if (!live || pluginFingerprint(live) !== reviewedFingerprint) throw new Error(t('plugin_settings_changed'));
        }
    });
    pluginRuntimeNotifyUi();
}

async function pluginRevokeGrant(installed) {
    stopPluginInstance(installed.id, t('plugin_revoked'), { skipDependents: false });
    await savePluginSettingsChange(function(candidate) {
        clearPluginGrant(candidate, installed.id);
    });
    pluginRuntimeNotifyUi();
}

function openPluginGrantDialog(installed) {
    var capabilities = (installed.capabilities || []).map(function(capability) {
        return '<label class="feature-check"><input type="checkbox" data-plugin-grant-capability="' + escapeHtml(capability) + '" checked>' +
            escapeHtml(pluginCapabilityLabel(capability)) + '</label>';
    }).join('');
    var body = '<p class="feature-hint">' + escapeHtml(t('plugin_grant_hint')) + '</p>' +
        (capabilities || '<p class="feature-hint">' + escapeHtml(t('plugin_none')) + '</p>') +
        ((installed.network || []).length ? '<p class="feature-hint">' + escapeHtml(t('plugin_network') + ': ' + pluginNetworkText(installed)) + '</p>' : '');
    var dialog = openFeatureDialog('pluginGrantDialog', t('plugin_grant_title'), body, async function(form) {
        var selected = Array.from(form.querySelectorAll('[data-plugin-grant-capability]')).filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.pluginGrantCapability; });
        await pluginGrantCapabilities(installed, selected);
        refreshPluginManager();
    }, { saveLabel: t('plugin_authorize') });
    return dialog;
}

async function pluginEnable(pluginId) {
    await startPluginInstance(pluginId);
    refreshPluginManager();
}

function pluginManagerReadFile(dialog, file, updateId) {
    return readPluginPackageFile(file).then(function(record) {
        openPluginImportPreview(record, dialog, updateId);
    });
}

function openPluginManager() {
    var dialog = openFeatureDialog('pluginManager', t('plugin_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('plugin_manager_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-plugin-import>' + escapeHtml(t('plugin_import')) + '</button></div>' +
        '<input id="pluginImportFile" type="file" accept=".json,application/json" hidden>' +
        '<input id="pluginUpdateFile" type="file" accept=".json,application/json" hidden>' +
        '<div data-plugin-list></div>' +
        '<h3 class="feature-section-title">' + escapeHtml(t('plugin_private_title')) + '</h3>' +
        '<p class="feature-hint">' + escapeHtml(t('plugin_private_hint')) + '</p>' +
        '<div data-plugin-data-list></div>', null);
    dialog.addEventListener('click', async function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        var installed = button.dataset.pluginGrant || button.dataset.pluginRevoke || button.dataset.pluginStop ||
            button.dataset.pluginEnable || button.dataset.pluginUpdate || button.dataset.pluginRollback ||
            button.dataset.pluginUninstall;
        var record = installed ? getInstalledPluginById(installed) : null;
        try {
            if (button.hasAttribute('data-plugin-import')) dialog.querySelector('#pluginImportFile').click();
            if (button.hasAttribute('data-plugin-retry')) await retryPluginSettingsChange();
            if (button.dataset.pluginAction && button.dataset.pluginActionTarget) {
                pluginRuntimeTriggerAction(button.dataset.pluginActionTarget, button.dataset.pluginAction);
            }
            if (button.dataset.pluginGrant && record) openPluginGrantDialog(record);
            if (button.dataset.pluginRevoke && record && await confirmFeatureAction(t('plugin_revoke_confirm'), t('plugin_revoke'))) await pluginRevokeGrant(record);
            if (button.dataset.pluginStop) stopPluginInstance(button.dataset.pluginStop, t('plugin_disabled'), { skipDependents: false });
            if (button.dataset.pluginEnable) await pluginEnable(button.dataset.pluginEnable);
            if (button.dataset.pluginUpdate) {
                dialog.querySelector('#pluginUpdateFile').dataset.pluginId = button.dataset.pluginUpdate;
                dialog.querySelector('#pluginUpdateFile').click();
            }
            if (button.dataset.pluginRollback && record && await confirmFeatureAction(t('plugin_rollback_confirm'), t('plugin_rollback'))) await pluginRollback(record);
            if (button.dataset.pluginUninstall && record && await confirmFeatureAction(t('plugin_uninstall_confirm'), t('plugin_uninstall'))) await pluginUninstall(record);
            if (button.dataset.pluginExportData) {
                downloadJsonFile(pluginPrivateDataExport(button.dataset.pluginExportData), 'opentavern-plugin-' + button.dataset.pluginExportData + '.json');
            }
            if (button.dataset.pluginClearData && await confirmFeatureAction(t('plugin_clear_data_confirm'), t('plugin_clear_data'))) {
                await pluginClearPrivateData(button.dataset.pluginClearData);
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message || String(error);
        }
        refreshPluginManager();
    });
    dialog.querySelector('#pluginImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try { await pluginManagerReadFile(dialog, file, null); }
        catch (error) { dialog.querySelector('.feature-error').textContent = error.message || String(error); }
    };
    dialog.querySelector('#pluginUpdateFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        var updateId = event.target.dataset.pluginId;
        event.target.value = '';
        if (!file) return;
        try { await pluginManagerReadFile(dialog, file, updateId); }
        catch (error) { dialog.querySelector('.feature-error').textContent = error.message || String(error); }
    };
    refreshPluginManager();
    return dialog;
}
