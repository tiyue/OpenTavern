// Secondary diff dialog used by preset management and the import candidate preview.
function renderPresetDiffValue(value) {
    var text = presetDiffValueLabel(value);
    return '<span class="preset-diff-value">' + escapeHtml(text) + '</span>';
}

function renderPresetDiffFields(fields) {
    return '<div class="feature-grid">' + fields.map(function(field) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(field.key) + '</strong><small>' +
            renderPresetDiffValue(field.left) + ' → ' + renderPresetDiffValue(field.right) + '</small></span></div>';
    }).join('') + '</div>';
}

function renderPresetDiffInlineFields(fields) {
    return '<small>' + fields.map(function(field) {
        return escapeHtml(field.key) + ': ' + renderPresetDiffValue(field.left) + ' → ' + renderPresetDiffValue(field.right);
    }).join(' · ') + '</small>';
}

function renderPresetDiffText(host, lines) {
    host.replaceChildren();
    (lines || []).forEach(function(line) {
        var row = document.createElement('div');
        row.className = 'preset-diff-line' + (line.type === 'add' ? ' preset-diff-line-add' : line.type === 'del' ? ' preset-diff-line-del' : '');
        if (line.words && line.type !== 'same') {
            line.words.forEach(function(word) {
                if (word.type === 'same') {
                    row.appendChild(document.createTextNode(word.text));
                    return;
                }
                if (word.type !== line.type) return;
                var mark = document.createElement('span');
                mark.className = 'preset-diff-word preset-diff-word-' + word.type;
                mark.textContent = word.text;
                row.appendChild(mark);
            });
        } else {
            row.textContent = line.text;
        }
        host.appendChild(row);
    });
}

function appendPresetDiffTextBlock(host, title, textDiff) {
    var block = document.createElement('details');
    block.className = 'preset-diff-block';
    var summary = document.createElement('summary');
    summary.textContent = title;
    block.appendChild(summary);
    var body = document.createElement('div');
    body.className = 'feature-greeting-preview';
    renderPresetDiffText(body, textDiff);
    block.appendChild(body);
    host.appendChild(block);
}

function renderPresetDiffSections(host, diff) {
    host.replaceChildren();
    var stats = document.createElement('p');
    stats.className = 'preset-diff-summary';
    stats.textContent = t('preset_diff_stats')
        .replace('{changed}', String(diff.prompts.changed.length))
        .replace('{added}', String(diff.prompts.added.length))
        .replace('{removed}', String(diff.prompts.removed.length));
    host.appendChild(stats);

    var metadata = document.createElement('details');
    metadata.className = 'preset-diff-block';
    metadata.open = diff.metadata.length > 0;
    var metadataSummary = document.createElement('summary');
    metadataSummary.textContent = t('preset_diff_metadata') + ' (' + diff.metadata.length + ')';
    metadata.appendChild(metadataSummary);
    if (diff.metadata.length) {
        var metadataBody = document.createElement('div');
        metadataBody.innerHTML = renderPresetDiffFields(diff.metadata);
        metadata.appendChild(metadataBody);
    } else {
        var same = document.createElement('p'); same.className = 'feature-hint'; same.textContent = t('preset_diff_same'); metadata.appendChild(same);
    }
    host.appendChild(metadata);

    var orderChanged = diff.prompts.leftOrder.join('\u0001') !== diff.prompts.rightOrder.join('\u0001');
    var orderBlock = document.createElement('details');
    orderBlock.className = 'preset-diff-block';
    orderBlock.open = orderChanged;
    var orderSummary = document.createElement('summary');
    orderSummary.textContent = t('preset_diff_order') + (orderChanged ? ' · ' + t('preset_diff_changed') : ' · ' + t('preset_diff_same'));
    orderBlock.appendChild(orderSummary);
    if (orderChanged) {
        var orderText = document.createElement('p');
        orderText.className = 'preset-diff-summary';
        orderText.textContent = diff.prompts.leftOrder.join(' → ') + '\n' + diff.prompts.rightOrder.join(' → ');
        orderBlock.appendChild(orderText);
    }
    host.appendChild(orderBlock);

    diff.prompts.changed.forEach(function(item) {
        var title = t('preset_diff_prompt_changed') + ': ' + item.name;
        if (item.textDiff) appendPresetDiffTextBlock(host, title, item.textDiff);
        else {
            var block = document.createElement('details');
            block.className = 'preset-diff-block';
            var summary = document.createElement('summary'); summary.textContent = title;
            block.appendChild(summary);
            var body = document.createElement('div'); body.innerHTML = renderPresetDiffFields(item.fields);
            block.appendChild(body);
            host.appendChild(block);
        }
        if (item.textDiff && item.fields.length) {
            var fieldsBlock = document.createElement('details');
            fieldsBlock.className = 'preset-diff-block';
            var fieldsSummary = document.createElement('summary'); fieldsSummary.textContent = item.name + ' · ' + t('preset_diff_fields');
            fieldsBlock.appendChild(fieldsSummary);
            var fieldsBody = document.createElement('div'); fieldsBody.innerHTML = renderPresetDiffFields(item.fields);
            fieldsBlock.appendChild(fieldsBody);
            host.appendChild(fieldsBlock);
        }
    });
    diff.prompts.added.forEach(function(item) { appendPresetDiffTextBlock(host, t('preset_diff_prompt_added') + ': ' + item.name, item.textDiff); });
    diff.prompts.removed.forEach(function(item) { appendPresetDiffTextBlock(host, t('preset_diff_prompt_removed') + ': ' + item.name, item.textDiff); });

    var regex = document.createElement('details');
    regex.className = 'preset-diff-block';
    regex.open = !!(diff.regex.added.length || diff.regex.removed.length || diff.regex.changed.length);
    var regexSummary = document.createElement('summary');
    regexSummary.textContent = t('preset_diff_regex') + ' (' + (diff.regex.added.length + diff.regex.removed.length + diff.regex.changed.length) + ')';
    regex.appendChild(regexSummary);
    if (diff.regex.added.length || diff.regex.removed.length || diff.regex.changed.length) {
        var regexBody = document.createElement('div');
        regexBody.innerHTML = diff.regex.changed.map(function(item) { return '<div class="feature-row"><span><strong>' + escapeHtml(t('preset_diff_changed') + ': ' + item.name) + '</strong>' + renderPresetDiffInlineFields(item.fields) + '</span></div>'; }).join('') +
            diff.regex.added.map(function(item) { return '<p class="feature-hint">' + escapeHtml(t('preset_diff_added') + ': ' + item.name) + '</p>'; }).join('') +
            diff.regex.removed.map(function(item) { return '<p class="feature-hint">' + escapeHtml(t('preset_diff_removed') + ': ' + item.name) + '</p>'; }).join('');
        regex.appendChild(regexBody);
    }
    host.appendChild(regex);
}

function openPresetDiffDialog(options) {
    options = options || {};
    ensurePresetLibrary();
    var library = state.settings.presetLibrary || [];
    var candidate = options.candidate || null;
    var leftId = options.left && options.left.id || state.settings.activePresetId || (library[0] && library[0].id);
    var rightId = candidate ? '' : (options.right && options.right.id || (library.find(function(item) { return item.id !== leftId; }) || {}).id || leftId);
    var dialog = openFeatureDialog('presetDiffDialog', t('preset_diff_title'),
        '<p class="feature-hint">' + escapeHtml(t('preset_diff_hint')) + '</p>' +
        '<div class="feature-grid"><label class="feature-field" for="presetDiffLeft"><span>' + escapeHtml(t('preset_diff_left')) + '</span><select id="presetDiffLeft">' +
        library.map(function(item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name || item.id) + '</option>'; }).join('') + '</select></label>' +
        (candidate
            ? '<div class="feature-field"><span>' + escapeHtml(t('preset_diff_right')) + '</span><p class="feature-hint">' + escapeHtml(t('preset_diff_candidate') + ': ' + (candidate.name || t('preset_diff_candidate_default'))) + '</p></div>'
            : '<label class="feature-field" for="presetDiffRight"><span>' + escapeHtml(t('preset_diff_right')) + '</span><select id="presetDiffRight">' +
                library.map(function(item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name || item.id) + '</option>'; }).join('') + '</select></label>') +
        '</div><div id="presetDiffBody"></div>',
        candidate && typeof options.commitCandidate === 'function' ? async function() {
            await options.commitCandidate();
        } : null,
        { saveLabel: candidate ? t('preset_diff_save_candidate') : '', lockWhileSaving: true });
    function getPreset(id) {
        if (candidate && id === '') return candidate;
        return library.find(function(item) { return item.id === id; }) || null;
    }
    function render() {
        var left = getPreset(dialog.querySelector('#presetDiffLeft').value);
        var right = candidate || getPreset(dialog.querySelector('#presetDiffRight') && dialog.querySelector('#presetDiffRight').value);
        if (!left || !right) return;
        renderPresetDiffSections(dialog.querySelector('#presetDiffBody'), buildPresetDiff(left, right));
    }
    dialog.querySelector('#presetDiffLeft').value = leftId;
    dialog.querySelector('#presetDiffLeft').onchange = render;
    if (dialog.querySelector('#presetDiffRight')) {
        dialog.querySelector('#presetDiffRight').value = rightId;
        dialog.querySelector('#presetDiffRight').onchange = render;
    }
    render();
    return dialog;
}

function openPresetDiffForImport(candidate) {
    return openPresetDiffDialog({
        candidate: candidate,
        commitCandidate: async function() {
            await addLibraryPreset(candidate);
            alert(t('settings_st_preset_import_success'));
        }
    });
}
