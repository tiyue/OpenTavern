function openBackupRestorePreview(data) {
    var available = getBackupRestoreAvailability(data), plan = null;
    var body = '<p class="feature-hint">按选项合并备份。已有会话、世界书和预设冲突时保留副本；同名角色保留本机版本。普通设置覆盖选中项，全局正则替换本机列表。本机凭据不恢复。</p>' +
        '<fieldset class="backup-restore-sections"><legend>选择恢复内容</legend>' + BACKUP_RESTORE_SECTIONS.map(function(section) {
            return '<label class="feature-check"><input type="checkbox" data-restore-section="' + section[0] + '"' + (available[section[0]] ? ' checked' : ' disabled') + '>' + section[1] + (available[section[0]] ? '' : '（备份不含此项）') + '</label>';
        }).join('') + '</fieldset><div data-restore-preview aria-live="polite"></div>';
    var dialog = openFeatureDialog('backupRestoreDialog', '恢复备份', body, async function() {
        if (!plan) throw new Error('请先检查恢复选项。');
        await commitBackupRestorePlan(plan);
    }, { saveLabel: '确认恢复', lockWhileSaving: true });
    function preview() {
        var selection = {};
        dialog.querySelectorAll('[data-restore-section]').forEach(function(input) { selection[input.dataset.restoreSection] = input.checked; });
        var target = dialog.querySelector('[data-restore-preview]'), submit = dialog.querySelector('[type="submit"]');
        try {
            plan = buildBackupRestorePlan(data, selection);
            target.innerHTML = '<div class="backup-restore-counts">' + BACKUP_RESTORE_SECTIONS.filter(function(section) { return plan.selection[section[0]]; }).map(function(section) { return '<p>' + section[1] + '：' + plan.counts[section[0]] + '</p>'; }).join('') + '</div>' +
                (plan.conflicts.length ? '<details><summary>冲突处理（' + plan.conflicts.length + '）</summary><ul>' + plan.conflicts.map(function(text) { return '<li>' + escapeHtml(text) + '</li>'; }).join('') + '</ul></details>' : '<p class="feature-hint">没有 ID 冲突。</p>') +
                (selection.settings && typeof settingsFormDraft !== 'undefined' && settingsFormDraft ? '<p class="feature-hint">恢复普通设置成功后，当前未完成的设置表单将放弃并关闭。已完成的即时操作会保留。</p>' : '') +
                (selection.presets || selection.regex ? '<p class="feature-hint">所选预设或正则沿用备份中的启用状态，请确认来源可信。</p>' : '');
            dialog.querySelector('.feature-error').textContent = '';
            submit.disabled = !Object.values(plan.selection).some(Boolean);
        } catch (error) {
            plan = null; target.textContent = ''; submit.disabled = true;
            dialog.querySelector('.feature-error').textContent = error.message || String(error);
        }
    }
    dialog.querySelectorAll('[data-restore-section]').forEach(function(input) { input.addEventListener('change', preview); });
    preview(); return dialog;
}
