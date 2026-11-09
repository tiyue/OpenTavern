/**
 * 新手导读（文件：32-documents.js）
 *
 * 负责什么：这是“资料库”中的“资料原文、修订与绑定”部分。
 * 在程序中的位置：它保存 UTF-8 TXT/Markdown 原文和显式绑定；向量只在独立检索缓存中重建。
 * 从哪里开始看：主要从 `readDocumentFile()`、`addDocumentFromFile()`、`replaceDocumentFromFile()`、`setDocumentBindings()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：同名不覆盖，保存失败保留原件；资料文本只能作为资料，不能被当作宿主指令或脚本执行。
 */
// ==================== Document Library ====================
var DOCUMENT_MAX_BYTES = 480000;
var DOCUMENT_MAX_CHARS = 120000;
var DOCUMENT_MAX_COUNT = 12;
var DOCUMENT_TOTAL_MAX_CHARS = 600000;
var DOCUMENT_PREVIEW_CHARS = 20000;
var DOCUMENT_NAME_MAX_CHARS = 180;
var DOCUMENT_FORMATS = { txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown' };
var failedDocumentCandidate = null;
var failedDocumentCandidateBaseline = null;

function computeDocumentRevision(content) {
    var value = String(content || '');
    return 'd1:' + retrievalTextFingerprint(value) + ':' + value.length;
}

function normalizeDocumentBinding(binding) {
    if (!binding || typeof binding !== 'object') return null;
    var scope = String(binding.scope || '');
    if (['global', 'character', 'conversation'].indexOf(scope) < 0) return null;
    var targetId = scope === 'global' ? '' : String(binding.targetId || '').trim().slice(0, 200);
    if (scope !== 'global' && !targetId) return null;
    return { scope: scope, targetId: targetId };
}

function normalizeDocumentRecord(record, id) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    var content = String(record.content == null ? '' : record.content);
    if (!content.trim()) return null;
    var format = String(record.format || '').toLowerCase();
    if (format !== 'markdown') format = 'txt';
    var bindings = Array.isArray(record.bindings) ? record.bindings.map(normalizeDocumentBinding).filter(Boolean) : [];
    var seen = Object.create(null);
    bindings = bindings.filter(function(binding) {
        var key = binding.scope + '|' + binding.targetId;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
    return {
        id: String(id || record.id || ''),
        name: String(record.name || '').trim().slice(0, 200) || t('document_untitled'),
        format: format,
        content: content,
        revision: computeDocumentRevision(content),
        createdAt: Number(record.createdAt || record.created || Date.now()) || Date.now(),
        updatedAt: Number(record.updatedAt || record.updated || Date.now()) || Date.now(),
        bindings: bindings
    };
}

function ensureDocumentsState() {
    if (!state.documents || typeof state.documents !== 'object' || Array.isArray(state.documents)) state.documents = {};
    Object.keys(state.documents).forEach(function(id) {
        var record = normalizeDocumentRecord(state.documents[id], id);
        if (record) state.documents[id] = record;
    });
    return state.documents;
}

function getDocumentRecords() {
    ensureDocumentsState();
    return Object.keys(state.documents).map(function(id) { return state.documents[id]; }).sort(function(a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.name).localeCompare(String(b.name));
    });
}

function getDocumentById(id) {
    ensureDocumentsState();
    return state.documents[id] || null;
}

function getDocumentFormatFromFile(file) {
    var name = String(file && file.name || '').toLowerCase();
    var extension = name.indexOf('.') >= 0 ? name.slice(name.lastIndexOf('.') + 1) : '';
    if (extension === 'txt') return 'txt';
    if (extension === 'md' || extension === 'markdown') return 'markdown';
    var mime = String(file && file.type || '').toLowerCase();
    if (mime === 'text/plain') return 'txt';
    if (mime === 'text/markdown' || mime === 'text/x-markdown') return 'markdown';
    return '';
}

function validateDocumentContentLimits(content, options) {
    options = options || {};
    var value = String(content || '');
    if (!value.trim()) throw new Error(t('document_empty'));
    if (value.indexOf('\u0000') >= 0) throw new Error(t('document_invalid_text'));
    if (value.length > DOCUMENT_MAX_CHARS) throw new Error(t('document_too_large'));
    var bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : value.length;
    if (bytes > DOCUMENT_MAX_BYTES) throw new Error(t('document_too_large'));
    if (options.enforceTotals !== false) {
        ensureDocumentsState();
        var docs = state.documents || {};
        var count = Object.keys(docs).filter(function(id) { return id !== options.excludeId; }).length;
        if (count >= DOCUMENT_MAX_COUNT) throw new Error(t('document_count_limit'));
        var total = Object.keys(docs).reduce(function(sum, id) {
            if (id === options.excludeId) return sum;
            return sum + String(docs[id] && docs[id].content || '').length;
        }, 0);
        if (total + value.length > DOCUMENT_TOTAL_MAX_CHARS) throw new Error(t('document_total_limit'));
    }
    return value;
}

function uniqueDocumentName(name, excludeId) {
    ensureDocumentsState();
    var base = String(name || '').trim().slice(0, DOCUMENT_NAME_MAX_CHARS) || t('document_untitled');
    var dot = base.lastIndexOf('.');
    var stem = dot > 0 ? base.slice(0, dot) : base;
    var extension = dot > 0 ? base.slice(dot) : '';
    var used = Object.create(null);
    Object.keys(state.documents || {}).forEach(function(id) {
        if (id !== excludeId) used[String(state.documents[id].name || '').toLowerCase()] = true;
    });
    var candidate = base;
    var suffix = 2;
    while (used[candidate.toLowerCase()]) {
        candidate = stem + ' (' + suffix++ + ')' + extension;
    }
    return candidate;
}

function decodeDocumentBytes(bytes) {
    if (typeof TextDecoder !== 'function') throw new Error(t('document_encoding_invalid'));
    try {
        var text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        return text.replace(/\r\n?/g, '\n');
    } catch (_) {
        throw new Error(t('document_encoding_invalid'));
    }
}

function readDocumentFile(file) {
    if (!file) return Promise.reject(new Error(t('document_file_missing')));
    var format = getDocumentFormatFromFile(file);
    if (!format) return Promise.reject(new Error(t('document_format_unsupported')));
    var size = Number(file.size || 0);
    if (size > DOCUMENT_MAX_BYTES) return Promise.reject(new Error(t('document_too_large')));
    var read = typeof file.arrayBuffer === 'function'
        ? file.arrayBuffer()
        : new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(reader.error || new Error(t('document_read_failed'))); };
            reader.readAsArrayBuffer(file);
        });
    return Promise.resolve(read).then(function(buffer) {
        var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (!bytes.length) throw new Error(t('document_empty'));
        if (bytes.length > DOCUMENT_MAX_BYTES) throw new Error(t('document_too_large'));
        var content = decodeDocumentBytes(bytes);
        validateDocumentContentLimits(content, { enforceTotals: false });
        return { name: String(file.name || t('document_untitled')).trim(), format: format, content: content };
    });
}

function validateDocumentBindings(bindings) {
    var normalized = [];
    var seen = Object.create(null);
    (bindings || []).forEach(function(binding) {
        var item = normalizeDocumentBinding(binding);
        if (!item) throw new Error(t('document_binding_invalid'));
        if (item.scope === 'conversation' && !(state.conversations && state.conversations[item.targetId])) throw new Error(t('document_binding_target_missing'));
        if (item.scope === 'character' && !(state.characters && state.characters[item.targetId])) throw new Error(t('document_binding_target_missing'));
        var key = item.scope + '|' + item.targetId;
        if (seen[key]) return;
        seen[key] = true;
        normalized.push(item);
    });
    return normalized;
}

function validateDocumentsCandidate(candidate) {
    var ids = Object.keys(candidate || {});
    if (ids.length > DOCUMENT_MAX_COUNT) throw new Error(t('document_count_limit'));
    var total = 0;
    ids.forEach(function(id) {
        var record = normalizeDocumentRecord(candidate[id], id);
        if (!record) throw new Error(t('document_invalid_record'));
        total += record.content.length;
        if (record.content.length > DOCUMENT_MAX_CHARS) throw new Error(t('document_too_large'));
        record.bindings = validateDocumentBindings(record.bindings);
        candidate[id] = record;
    });
    if (total > DOCUMENT_TOTAL_MAX_CHARS) throw new Error(t('document_total_limit'));
    return candidate;
}

async function commitDocumentsCandidate(candidate, options) {
    options = options || {};
    validateDocumentsCandidate(candidate);
    var baseline = options.baseline !== undefined ? options.baseline : JSON.stringify(state.documents || {});
    var serialized = JSON.stringify(candidate);
    function validate() {
        if (JSON.stringify(state.documents || {}) !== baseline) throw new Error(t('document_library_changed'));
    }
    await persistState(true, {
        throwOnError: true,
        beforePersist: validate,
        transformSnapshot: function(snapshot) {
            snapshot.documents = JSON.parse(serialized);
            return snapshot;
        },
        onPersistSuccess: function() {
            validate();
            state.documents = JSON.parse(serialized);
            ensureDocumentsState();
            failedDocumentCandidate = null;
            failedDocumentCandidateBaseline = null;
        },
        commitPendingSnapshot: function(snapshot) {
            snapshot.documents = JSON.parse(serialized);
        }
    });
    if (typeof appStore !== 'undefined') appStore.notify(['documents']);
    return options.result;
}

async function saveDocumentCandidateMutation(mutator, options) {
    ensureDocumentsState();
    var candidate = JSON.parse(JSON.stringify(state.documents));
    var baseline = JSON.stringify(state.documents || {});
    var result = mutator(candidate);
    try {
        await commitDocumentsCandidate(candidate, { result: result, baseline: baseline });
    } catch (error) {
        failedDocumentCandidate = JSON.parse(JSON.stringify(candidate));
        failedDocumentCandidateBaseline = baseline;
        throw error;
    }
    return result;
}

async function retryFailedDocumentSave() {
    if (!failedDocumentCandidate) throw new Error(t('document_no_failed_draft'));
    if (JSON.stringify(state.documents || {}) !== failedDocumentCandidateBaseline) throw new Error(t('document_library_changed'));
    var candidate = JSON.parse(JSON.stringify(failedDocumentCandidate));
    await commitDocumentsCandidate(candidate, { baseline: failedDocumentCandidateBaseline });
    return true;
}

function getFailedDocumentCandidate() {
    return failedDocumentCandidate ? JSON.parse(JSON.stringify(failedDocumentCandidate)) : null;
}

function clearFailedDocumentCandidate() {
    failedDocumentCandidate = null;
    failedDocumentCandidateBaseline = null;
}

function addDocumentFromFile(file) {
    return readDocumentFile(file).then(function(read) {
        var content = validateDocumentContentLimits(read.content, {});
        var now = Date.now();
        var record = {
            id: makeId(),
            name: uniqueDocumentName(read.name),
            format: read.format,
            content: content,
            revision: computeDocumentRevision(content),
            createdAt: now,
            updatedAt: now,
            bindings: []
        };
        return saveDocumentCandidateMutation(function(candidate) {
            candidate[record.id] = record;
            return record;
        }).then(function(saved) {
            return saved;
        });
    });
}

function replaceDocumentFromFile(id, file) {
    var existing = getDocumentById(id);
    if (!existing) return Promise.reject(new Error(t('document_missing')));
    return readDocumentFile(file).then(function(read) {
        var content = validateDocumentContentLimits(read.content, { excludeId: id });
        return saveDocumentCandidateMutation(function(candidate) {
            var current = candidate[id];
            if (!current) throw new Error(t('document_missing'));
            candidate[id] = Object.assign({}, current, {
                format: read.format,
                content: content,
                revision: computeDocumentRevision(content),
                updatedAt: Date.now()
            });
            return candidate[id];
        }).then(function(saved) {
            return deleteRetrievalIndexSource('document:' + id).catch(function() {}).then(function() {
                return saved;
            });
        });
    });
}

function renameDocument(id, name) {
    var nextName = String(name == null ? '' : name).trim();
    if (!nextName) throw new Error(t('document_name_required'));
    if (nextName.length > DOCUMENT_NAME_MAX_CHARS) throw new Error(t('document_name_too_long'));
    return saveDocumentCandidateMutation(function(candidate) {
        if (!candidate[id]) throw new Error(t('document_missing'));
        var next = uniqueDocumentName(nextName, id);
        candidate[id].name = next;
        candidate[id].updatedAt = Date.now();
        return candidate[id];
    });
}

function setDocumentBindings(id, bindings) {
    var normalized = validateDocumentBindings(bindings);
    return saveDocumentCandidateMutation(function(candidate) {
        if (!candidate[id]) throw new Error(t('document_missing'));
        candidate[id].bindings = normalized;
        candidate[id].updatedAt = Date.now();
        return candidate[id];
    }).then(function(saved) {
        if (normalized.length || typeof deleteRetrievalIndexSource !== 'function') return saved;
        return deleteRetrievalIndexSource('document:' + id).catch(function() {}).then(function() { return saved; });
    });
}

function addDocumentBinding(id, scope, targetId) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    var bindings = document.bindings.slice();
    bindings.push({ scope: scope, targetId: targetId });
    return setDocumentBindings(id, bindings);
}

function removeDocumentBinding(id, scope, targetId) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    return setDocumentBindings(id, document.bindings.filter(function(binding) {
        return !(binding.scope === scope && binding.targetId === targetId);
    }));
}

async function deleteDocument(id) {
    await saveDocumentCandidateMutation(function(candidate) {
        if (!candidate[id]) throw new Error(t('document_missing'));
        delete candidate[id];
        return true;
    });
    try { await deleteRetrievalIndexSource('document:' + id); } catch (_) {}
    return true;
}

function buildDocumentExportData(id) {
    var document = getDocumentById(id);
    if (!document) throw new Error(t('document_missing'));
    return {
        type: 'opentavern-document',
        version: 1,
        exported_at: new Date().toISOString(),
        document: JSON.parse(JSON.stringify(document))
    };
}

function documentBindingLabel(binding) {
    if (!binding) return '';
    if (binding.scope === 'global') return t('document_scope_global');
    if (binding.scope === 'character') {
        var character = state.characters && state.characters[binding.targetId];
        return t('document_scope_character') + ' · ' + (character && character.name || binding.targetId);
    }
    var conversation = state.conversations && state.conversations[binding.targetId];
    return t('document_scope_conversation') + ' · ' + (conversation && (conversation.title || conversation.id) || binding.targetId);
}
