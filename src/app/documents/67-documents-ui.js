/**
 * 新手导读（文件：67-documents-ui.js）
 *
 * 负责什么：这是“资料库”中的“二级管理界面”部分。
 * 在程序中的位置：它提供导入、预览、绑定、替换、导出和删除资料的真实操作入口。
 * 从哪里开始看：主要从 `openDocumentLibrary()`、`openDocumentPreview()`、`openDocumentBindingDialog()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：资料原文只能用文本方式展示；导入/替换失败时保留原件与可重试草稿。
 */
// ==================== Document Library UI ====================
var documentImportInput = null;
var documentReplaceInput = null;
var documentReplaceTargetId = '';
var documentLibraryRefresh = null;

function documentShortRevision(revision) {
    var value = String(revision || '');
    return value.length > 24 ? value.slice(0, 24) + '…' : value;
}

function documentFormatLabel(format) {
    return format === 'markdown' ? t('document_format_markdown') : t('document_format_text');
}

function documentExportFileName(record) {
    var name = String(record.name || record.id || 'document').trim() || 'document';
    name = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.(txt|md|markdown)$/i, '');
    return name + (record.format === 'markdown' ? '.md' : '.txt');
}

function documentExportMimeType(record) {
    return record.format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
}

function downloadDocumentTextFile(record) {
    var blob = new Blob([String(record.content || '')], { type: documentExportMimeType(record) });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = documentExportFileName(record);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function ensureDocumentFileInputs() {
    if (!documentImportInput) {
        documentImportInput = document.createElement('input');
        documentImportInput.type = 'file';
        documentImportInput.accept = '.txt,.md,.markdown,text/plain,text/markdown';
        documentImportInput.multiple = true;
        documentImportInput.hidden = true;
        documentImportInput.addEventListener('change', function() {
            var files = Array.prototype.slice.call(documentImportInput.files || []);
            documentImportInput.value = '';
            files.reduce(function(chain, file) {
                return chain.then(function() { return addDocumentFromFile(file); }).then(function() {
                    if (typeof documentLibraryRefresh === 'function') documentLibraryRefresh();
                });
            }, Promise.resolve()).catch(function(error) {
                if (typeof documentLibraryRefresh === 'function') documentLibraryRefresh(error.message);
            });
        });
        document.body.appendChild(documentImportInput);
    }
    if (!documentReplaceInput) {
        documentReplaceInput = document.createElement('input');
        documentReplaceInput.type = 'file';
        documentReplaceInput.accept = '.txt,.md,.markdown,text/plain,text/markdown';
        documentReplaceInput.hidden = true;
        documentReplaceInput.addEventListener('change', function() {
            var file = documentReplaceInput.files && documentReplaceInput.files[0];
            var id = documentReplaceTargetId;
            documentReplaceInput.value = '';
            if (!file || !id) return;
            replaceDocumentFromFile(id, file).then(function() {
                if (typeof documentLibraryRefresh === 'function') documentLibraryRefresh();
            }).catch(function(error) {
                if (typeof documentLibraryRefresh === 'function') documentLibraryRefresh(error.message);
            });
        });
        document.body.appendChild(documentReplaceInput);
    }
}

function renderDocumentBindingText(document) {
    if (!document.bindings || !document.bindings.length) return t('document_unbound');
    return document.bindings.map(documentBindingLabel).join(' · ');
}

function openDocumentLibrary() {
    ensureDocumentsState();
    ensureDocumentFileInputs();
    var dialog = openFeatureDialog('documentLibraryDialog', t('document_library_title'),
        '<p class="feature-hint">' + escapeHtml(t('document_library_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-document-import>' + escapeHtml(t('document_import')) + '</button>' +
        '<button type="button" data-document-retry hidden>' + escapeHtml(t('document_retry_save')) + '</button>' +
        '<button type="button" data-document-export-draft hidden>' + escapeHtml(t('document_export_failed_draft')) + '</button></div>' +
        '<p class="feature-hint" id="documentLibraryStatus" role="status" aria-live="polite"></p>' +
        '<div id="documentLibraryList"></div>', null);
    function status(message) {
        var node = dialog.querySelector('#documentLibraryStatus');
        if (node) node.textContent = message || '';
        var retry = dialog.querySelector('[data-document-retry]');
        if (retry) retry.hidden = !getFailedDocumentCandidate();
        var exportDraft = dialog.querySelector('[data-document-export-draft]');
        if (exportDraft) exportDraft.hidden = !getFailedDocumentCandidate();
    }
    function render() {
        var records = getDocumentRecords();
        var list = dialog.querySelector('#documentLibraryList');
        list.innerHTML = records.length ? records.map(function(document) {
            return '<div class="feature-row document-row" data-document-id="' + escapeHtml(document.id) + '">' +
                '<span><strong>' + escapeHtml(document.name) + '</strong>' +
                '<small>' + escapeHtml(documentFormatLabel(document.format)) + ' · ' + escapeHtml(t('document_revision')) + ' ' + escapeHtml(documentShortRevision(document.revision)) + '</small>' +
                '<small>' + escapeHtml(t('document_chars').replace('{n}', String(document.content.length))) + ' · ' + escapeHtml(renderDocumentBindingText(document)) + '</small>' +
                '<small data-document-index-status="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_index_checking')) + '</small></span>' +
                '<button type="button" data-document-rename="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_rename')) + '</button>' +
                '<button type="button" data-document-preview="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_preview')) + '</button>' +
                '<button type="button" data-document-bind="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_bind')) + '</button>' +
                '<button type="button" data-document-replace="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_replace')) + '</button>' +
                '<button type="button" data-document-export="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_export')) + '</button>' +
                '<button type="button" data-document-delete="' + escapeHtml(document.id) + '">' + escapeHtml(t('document_delete')) + '</button></div>';
        }).join('') : '<p class="feature-hint">' + escapeHtml(t('document_empty_library')) + '</p>';
        status('');
        refreshDocumentIndexStatuses(dialog, records);
    }
    documentLibraryRefresh = function(message) {
        render();
        if (message) status(message);
    };
    dialog.addEventListener('close', function() { documentLibraryRefresh = null; });
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-document-import')) { documentImportInput.click(); return; }
        if (button.hasAttribute('data-document-retry')) {
            retryFailedDocumentSave().then(function() { render(); status(t('document_save_retried')); }).catch(function(error) { status(error.message); });
            return;
        }
        if (button.hasAttribute('data-document-export-draft')) {
            var draft = getFailedDocumentCandidate();
            if (!draft) { status(t('document_no_failed_draft')); return; }
            downloadJsonFile({
                type: 'opentavern-document-draft',
                version: 1,
                exported_at: new Date().toISOString(),
                documents: draft
            }, 'opentavern-document-draft.json');
            return;
        }
        var id = button.dataset.documentRename || button.dataset.documentPreview || button.dataset.documentBind || button.dataset.documentReplace ||
            button.dataset.documentExport || button.dataset.documentDelete;
        if (!id) return;
        try {
            if (button.dataset.documentRename) openDocumentRenameDialog(id, documentLibraryRefresh);
            if (button.dataset.documentPreview) openDocumentPreview(id);
            if (button.dataset.documentBind) openDocumentBindingDialog(id, render);
            if (button.dataset.documentReplace) { documentReplaceTargetId = id; documentReplaceInput.click(); }
            if (button.dataset.documentExport) {
                var document = getDocumentById(id);
                if (document) downloadDocumentTextFile(document);
            }
            if (button.dataset.documentDelete) {
                confirmFeatureAction(t('document_delete_confirm').replace('{name}', (getDocumentById(id) || {}).name || id), t('document_delete')).then(function(confirmed) {
                    if (!confirmed) return;
                    deleteDocument(id).then(render).catch(function(error) { status(error.message); });
                });
            }
        } catch (error) {
            status(error.message);
        }
    });
    render();
    return dialog;
}

async function refreshDocumentIndexStatuses(dialog, records) {
    for (var index = 0; index < records.length; index++) {
        var document = records[index];
        var node = dialog.querySelector('[data-document-index-status="' + document.id + '"]');
        if (!node) continue;
        try {
            var record = await readRetrievalIndexSourceRecord('document:' + document.id);
            if (!record || record.revision !== document.revision) {
                node.textContent = t('document_index_not_ready');
                continue;
            }
            node.textContent = t('document_index_ready').replace('{n}', String(record.chunkCount || 0)).replace('{d}', String(record.dimensions || 0));
        } catch (error) {
            node.textContent = t('document_index_unavailable') + '：' + error.message;
        }
    }
}

function openDocumentPreview(id) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    var content = document.content.length > DOCUMENT_PREVIEW_CHARS
        ? document.content.slice(0, DOCUMENT_PREVIEW_CHARS) + '\n\n…（预览已截断）'
        : document.content;
    var chunks = chunkRetrievalText(document.content);
    openFeatureDialog('documentPreviewDialog', t('document_preview_title'),
        '<p class="feature-hint">' + escapeHtml(document.name) + ' · ' + escapeHtml(documentFormatLabel(document.format)) + ' · ' +
        escapeHtml(t('document_revision')) + ' ' + escapeHtml(documentShortRevision(document.revision)) + ' · ' +
        escapeHtml(t('document_chunk_count').replace('{n}', String(chunks.length))) + '</p>' +
        '<pre class="feature-greeting-preview document-preview-text"></pre>' +
        '<details><summary>' + escapeHtml(t('document_chunk_preview_title')) + '</summary>' +
        chunks.slice(0, 20).map(function(chunk, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(t('retrieval_source_chunk') + ' ' + (index + 1)) + '</strong>' +
                '<small>' + escapeHtml(chunk.text.slice(0, 300)) + (chunk.text.length > 300 ? '…' : '') + '</small></span></div>';
        }).join('') + '</details>', null).querySelector('.document-preview-text').textContent = content;
}

function openDocumentRenameDialog(id, onChange) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    openFeatureDialog('documentRenameDialog', t('document_rename_title'),
        '<p class="feature-hint">' + escapeHtml(t('document_rename_hint')) + '</p>' +
        featureField(t('document_rename_label'), 'documentRenameInput', document.name, 'text'),
        async function(dialog) {
            await renameDocument(id, dialog.querySelector('#documentRenameInput').value);
            if (onChange) onChange(t('document_rename_saved'));
        }, { saveLabel: t('save') });
}

function documentBindingTargetChoices(scope) {
    if (scope === 'global') return [['', t('document_scope_global')]];
    if (scope === 'character') {
        return Object.keys(state.characters || {}).sort().map(function(key) {
            return [key, state.characters[key].name || key];
        });
    }
    return Object.keys(state.conversations || {}).map(function(id) {
        return [id, state.conversations[id].title || id];
    });
}

function openDocumentBindingDialog(id, onChange) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    var dialog = openFeatureDialog('documentBindingDialog', t('document_bind_title'),
        '<p class="feature-hint">' + escapeHtml(t('document_bind_hint')) + '</p>' +
        '<div id="documentBindingList"></div>' +
        '<div class="feature-row"><span><strong>' + escapeHtml(t('document_add_binding')) + '</strong></span>' +
        '<select id="documentBindingScope"><option value="global">' + escapeHtml(t('document_scope_global')) + '</option>' +
        '<option value="character">' + escapeHtml(t('document_scope_character')) + '</option>' +
        '<option value="conversation">' + escapeHtml(t('document_scope_conversation')) + '</option></select>' +
        '<select id="documentBindingTarget" class="feature-field"></select>' +
        '<button type="button" id="documentAddBindingBtn">' + escapeHtml(t('document_add')) + '</button></div>' +
        '<p class="feature-hint" id="documentBindingStatus" role="status" aria-live="polite"></p>', null);
    function status(message) {
        var node = dialog.querySelector('#documentBindingStatus');
        if (node) node.textContent = message || '';
    }
    function renderTargets() {
        var scope = dialog.querySelector('#documentBindingScope').value;
        var target = dialog.querySelector('#documentBindingTarget');
        var choices = documentBindingTargetChoices(scope);
        target.innerHTML = choices.map(function(choice) {
            return '<option value="' + escapeHtml(choice[0]) + '">' + escapeHtml(choice[1]) + '</option>';
        }).join('');
        target.disabled = scope === 'global' || !choices.length;
    }
    function render() {
        var current = getDocumentById(id);
        if (!current) { dialog.close(); return; }
        dialog.querySelector('#documentBindingList').innerHTML = current.bindings.length ? current.bindings.map(function(binding) {
            return '<div class="feature-row"><span>' + escapeHtml(documentBindingLabel(binding)) + '</span>' +
                '<button type="button" data-remove-binding="' + escapeHtml(binding.scope + '|' + binding.targetId) + '">' + escapeHtml(t('document_unbind')) + '</button></div>';
        }).join('') : '<p class="feature-hint">' + escapeHtml(t('document_unbound')) + '</p>';
        renderTargets();
    }
    dialog.querySelector('#documentBindingScope').onchange = renderTargets;
    dialog.querySelector('#documentAddBindingBtn').onclick = function() {
        var scope = dialog.querySelector('#documentBindingScope').value;
        var target = scope === 'global' ? '' : dialog.querySelector('#documentBindingTarget').value;
        try {
            addDocumentBinding(id, scope, target).then(function() {
                render();
                if (onChange) onChange();
                status(t('document_binding_added'));
            }).catch(function(error) { status(error.message); });
        } catch (error) { status(error.message); }
    };
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('[data-remove-binding]');
        if (!button) return;
        var parts = String(button.dataset.removeBinding || '').split('|');
        removeDocumentBinding(id, parts[0], parts.slice(1).join('|')).then(function() {
            render();
            if (onChange) onChange();
            status(t('document_binding_removed'));
        }).catch(function(error) { status(error.message); });
    });
    render();
}
