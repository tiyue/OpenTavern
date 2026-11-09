// Bindings and display order are independent of prompt insertion order.
function normalizeWorldBookIds(ids) {
    var seen = new Set();
    return (Array.isArray(ids) ? ids : []).filter(function(id) {
        if (typeof id !== 'string' || seen.has(id) || !Object.prototype.hasOwnProperty.call(state.worldBooks || {}, id)) return false;
        seen.add(id);
        return !!state.worldBooks[id];
    });
}

function getGlobalWorldBookIds() {
    return normalizeWorldBookIds(state.settings && state.settings.globalWorldBookIds);
}

function getEffectiveWorldBookIds(conv) {
    return normalizeWorldBookIds((conv && Array.isArray(conv.worldBookIds) ? conv.worldBookIds : []).concat(getGlobalWorldBookIds()));
}

function getWorldInfoActivationEntryId(entry) {
    return (entry._sourceWorldBookId || 'inline') + ':' + String(entry.uid);
}

function getWorldBookEntrySignature(book) {
    var entries = normalizeImportedWorldInfo(entriesToSTFormat(book)).entries;
    return JSON.stringify(entries, function(key, value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        var sorted = {};
        Object.keys(value).sort().forEach(function(name) {
            Object.defineProperty(sorted, name, { value: value[name], enumerable: true });
        });
        return sorted;
    });
}

function prepareCharacterWorldBookRecords(json, character) {
    var primary = getEmbeddedCharacterBook(json), ext = character.extensions && character.extensions.opentavern;
    var extras = ext && ext.world_books;
    if (extras !== undefined && !Array.isArray(extras)) throw new Error('角色额外世界书须为数组。');
    var books = [], extraIds = [], primaryId = null;
    function prepare(spec, index) {
        if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('角色世界书格式无效。');
        var normalized = normalizeImportedWorldInfo(spec);
        if (!normalized || !normalized.entries || !Object.keys(normalized.entries).length) return null;
        var signature = getWorldBookEntrySignature(normalized);
        var reusable = books.concat(Object.values(state.worldBooks || {})).find(function(book) { return getWorldBookEntrySignature(book) === signature; });
        var book = reusable || { id: 'wb-' + makeId(), name: normalized.name || spec.name || character.name + (index < 0 ? ' 的世界书' : ' 的额外世界书 ' + (index + 1)), entries: normalized.entries, created: Date.now() };
        if (!books.some(function(value) { return value.id === book.id; })) books.push(book);
        return book.id;
    }
    if (primary) {
        try { primaryId = prepare(primary, -1); }
        catch (error) { console.warn('[Character] 内嵌主世界书无效，保留角色导入：', error); }
    }
    (extras || []).forEach(function(spec, index) { var id = prepare(spec, index); if (id && id !== primaryId && !extraIds.includes(id)) extraIds.push(id); });
    if (primaryId) character.linkedWorldBookId = primaryId;
    character.linkedExtraWorldBookIds = extraIds;
    return { books: books, primaryId: primaryId, extraIds: extraIds };
}

function linkPreparedCharacterWorldBooks(conv, character) {
    var ids = [character.linkedWorldBookId].concat(character.linkedExtraWorldBookIds || []).filter(Boolean);
    if (ids.length) conv.worldBookIds = Array.from(new Set((conv.worldBookIds || []).concat(ids)));
}

function getCharacterExtraWorldBooksForExport(character) {
    return normalizeWorldBookIds(character && character.linkedExtraWorldBookIds).map(function(id) {
        var book = state.worldBooks[id], format = entriesToSTFormat(book);
        return { name: book.name || '', entries: Object.values(format.entries || {}) };
    });
}

function getWorldBookDisplayIds() {
    return normalizeWorldBookIds((Array.isArray(state.settings.worldBookOrder) ? state.settings.worldBookOrder : []).concat(Object.keys(state.worldBooks || {})));
}

function getWorldBookEntryDisplayIds(book) {
    var entries = book.entries || {}, seen = new Set();
    var fallback = Object.keys(entries).sort(function(a, b) { return (entries[b].order || 0) - (entries[a].order || 0); });
    return (Array.isArray(book.entryDisplayOrder) ? book.entryDisplayOrder : []).concat(fallback).map(String).filter(function(id) {
        if (seen.has(id) || !Object.prototype.hasOwnProperty.call(entries, id)) return false;
        seen.add(id); return true;
    });
}

async function persistWorldBookChanges(changes) {
    function read(object, path) { return path.reduce(function(value, key) { return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined; }, object); }
    var roots = {};
    changes.forEach(function(change) {
        if (!Array.isArray(change.path) || change.path.length < 2 || change.path.some(function(key) { return ['__proto__', 'prototype', 'constructor'].includes(key); })) throw new Error('世界书保存路径无效。');
        roots[change.path[0]] = state[change.path[0]];
        if (!['settings', 'worldBooks', 'conversations'].includes(change.path[0])) throw new Error('世界书保存范围无效。');
        change.before = JSON.stringify(read(state, change.path));
        change.value = JSON.parse(JSON.stringify(change.value));
    });
    function check() {
        if (Object.keys(roots).some(function(key) { return state[key] !== roots[key]; }) || changes.some(function(change) { return JSON.stringify(read(state, change.path)) !== change.before; })) throw new Error('世界书或关联已变化，请重试。');
    }
    function merge(snapshot, pending) {
        changes.forEach(function(change) {
            if (pending && JSON.stringify(read(snapshot, change.path)) !== change.before) return;
            var object = read(snapshot, change.path.slice(0, -1));
            if (!object || typeof object !== 'object') { if (pending) return; throw new Error('世界书保存目标已变化。'); }
            Object.defineProperty(object, change.path[change.path.length - 1], { value: JSON.parse(JSON.stringify(change.value)), writable: true, enumerable: true, configurable: true });
        });
        return snapshot;
    }
    check();
    await persistState(true, { throwOnError: true, beforePersist: check, transformSnapshot: merge,
        onPersistSuccess: function() { check(); merge(state); }, commitPendingSnapshot: function(snapshot) { merge(snapshot, true); } });
    Object.values(state.conversations || {}).forEach(function(conv) { conv._wiCache = null; });
}

async function setWorldBookBinding(bookId, scope, enabled, conv) {
    if (!normalizeWorldBookIds([bookId]).length) throw new Error('世界书不存在。');
    if (scope !== 'global' && scope !== 'conversation') throw new Error('关联范围无效。');
    if (scope === 'conversation' && (!conv || state.conversations[conv.id] !== conv)) throw new Error('会话已变化。');
    var ids = scope === 'global' ? getGlobalWorldBookIds() : normalizeWorldBookIds(conv.worldBookIds);
    ids = ids.filter(function(id) { return id !== bookId; });
    if (enabled) ids.push(bookId);
    var path = scope === 'global' ? ['settings', 'globalWorldBookIds'] : ['conversations', conv.id, 'worldBookIds'];
    await persistWorldBookChanges([{ path: path, value: ids }]);
}

async function moveWorldBookDisplay(bookId, direction) {
    var ids = getWorldBookDisplayIds(), index = ids.indexOf(bookId), next = index + direction;
    if (![-1, 1].includes(direction) || index < 0 || next < 0 || next >= ids.length) return;
    ids.splice(index, 1); ids.splice(next, 0, bookId);
    await persistWorldBookChanges([{ path: ['settings', 'worldBookOrder'], value: ids }]);
}

async function moveWorldBookEntryDisplay(book, entryId, direction) {
    if (!book || state.worldBooks[book.id] !== book) throw new Error('世界书已变化。');
    var ids = getWorldBookEntryDisplayIds(book), index = ids.indexOf(String(entryId)), next = index + direction;
    if (![-1, 1].includes(direction) || index < 0 || next < 0 || next >= ids.length) return;
    ids.splice(index, 1); ids.splice(next, 0, String(entryId));
    await persistWorldBookChanges([{ path: ['worldBooks', book.id, 'entryDisplayOrder'], value: ids }]);
}

function appendWorldBookOrderButtons(container, index, total, move) {
    [-1, 1].forEach(function(direction) {
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'msg-action-btn';
        button.textContent = direction < 0 ? '↑' : '↓';
        button.setAttribute('aria-label', direction < 0 ? '上移显示位置' : '下移显示位置');
        button.disabled = direction < 0 ? index <= 0 : index >= total - 1;
        button.addEventListener('click', async function(event) {
            event.stopPropagation(); button.disabled = true;
            try { await move(direction); refreshWorldBookLeftPanel(); }
            catch (error) { alert(error.message); button.disabled = false; }
        });
        container.appendChild(button);
    });
}

function appendWorldBookBindingButtons(container, bookId) {
    var conv = getActiveConv();
    ['conversation', 'global'].forEach(function(scope) {
        var selected = scope === 'global' ? getGlobalWorldBookIds().includes(bookId) : !!(conv && (conv.worldBookIds || []).includes(bookId));
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'worldbook-binding-button';
        button.textContent = (selected ? '取消' : '用于') + (scope === 'global' ? '全局' : '会话');
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = scope === 'conversation' && !conv;
        button.addEventListener('click', async function(event) {
            event.stopPropagation(); button.disabled = true;
            try { await setWorldBookBinding(bookId, scope, !selected, conv); renderWorldInfoBadge(); refreshWorldBookLeftPanel(); }
            catch (error) { alert(error.message); button.disabled = false; }
        });
        container.appendChild(button);
    });
}
