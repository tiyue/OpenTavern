// Secondary editors shared by the preset, regex and conversation controls.
function openFeatureDialog(id, title, body, onSave, options) {
    options = options || {};
    var previous = document.getElementById(id);
    if (previous) previous.remove();
    var dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'feature-dialog';
    dialog.innerHTML = '<form class="feature-dialog-form"><header><h2>' + escapeHtml(title) + '</h2>' +
        '<button type="button" data-dialog-cancel aria-label="关闭">×</button></header>' +
        '<div class="feature-dialog-body">' + body + '</div><p class="feature-error" role="alert"></p>' +
        '<footer><button type="button" data-dialog-cancel>取消</button>' +
        (onSave ? '<button type="submit">' + escapeHtml(options.saveLabel || '保存') + '</button>' : '') + '</footer></form>';
    document.body.appendChild(dialog);
    var saving = false;
    dialog.querySelectorAll('[data-dialog-cancel]').forEach(function(button) {
        button.onclick = function() { if (!saving || !options.lockWhileSaving) dialog.close(); };
    });
    dialog.addEventListener('click', function(event) { if (event.target === dialog && (!saving || !options.lockWhileSaving)) dialog.close(); });
    dialog.addEventListener('cancel', function(event) { if (saving && options.lockWhileSaving) event.preventDefault(); });
    dialog.addEventListener('close', function() { if (options.onClose) options.onClose(); dialog.remove(); });
    dialog.querySelector('form').onsubmit = async function(event) {
        event.preventDefault();
        if (!onSave) return;
        var button = dialog.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        saving = true;
        if (options.lockWhileSaving) dialog.querySelectorAll('input, [data-dialog-cancel]').forEach(function(control) { control.dataset.restoreDisabled = control.disabled ? '1' : '0'; control.disabled = true; });
        try {
            if (await onSave(dialog) !== false) dialog.close();
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message || String(error);
        } finally {
            saving = false; button.disabled = false;
            if (options.lockWhileSaving) dialog.querySelectorAll('[data-restore-disabled]').forEach(function(control) { control.disabled = control.dataset.restoreDisabled === '1'; delete control.dataset.restoreDisabled; });
        }
    };
    dialog.showModal();
    return dialog;
}

function confirmFeatureAction(message, title) {
    return new Promise(function(resolve) {
        openFeatureDialog('featureConfirmDialog', title || '请确认', '<p class="feature-hint">' + escapeHtml(message) + '</p>', function() { resolve(true); }, { saveLabel: '继续', onClose: function() { resolve(false); } });
    });
}

function featureField(label, id, value, type, attributes) {
    var control = type === 'textarea'
        ? '<textarea id="' + id + '" rows="5" ' + (attributes || '') + '>' + escapeHtml(String(value == null ? '' : value)) + '</textarea>'
        : '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeHtml(String(value == null ? '' : value)) + '" ' + (attributes || '') + '>';
    return '<label class="feature-field" for="' + id + '"><span>' + escapeHtml(label) + '</span>' + control + '</label>';
}

function featureSelect(label, id, value, choices) {
    return '<label class="feature-field" for="' + id + '"><span>' + escapeHtml(label) + '</span><select id="' + id + '">' +
        choices.map(function(choice) { return '<option value="' + escapeHtml(choice[0]) + '"' + (String(value) === choice[0] ? ' selected' : '') + '>' + escapeHtml(choice[1]) + '</option>'; }).join('') + '</select></label>';
}

function featureNumber(dialog, id, min, max, integer) {
    var input = dialog.querySelector('#' + id);
    var value = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        input.focus();
        throw new Error(input.closest('label').querySelector('span').textContent + '：请输入 ' + min + '–' + max + (integer ? ' 的整数' : ' 的数值'));
    }
    return value;
}
