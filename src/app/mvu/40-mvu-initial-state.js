// MVU sources are JSON history; replay and caches never mutate messages or macro variables.
var mvuRuntimeCache = new WeakMap();
var mvuRuntimeInitialReports = new WeakMap();
var MVU_MAX_RUNTIME_SNAPSHOTS = 200;
var MVU_MAX_RUNTIME_CACHE_BYTES = 8 * 1024 * 1024;

function cloneMvuRuntimeValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getMvuConversationCharacters(conv) {
    if (conv && conv.group && Array.isArray(conv.group.members) && conv.group.members.length >= 2) {
        return conv.group.members.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); }).map(function(member) { return member.character; }).filter(Boolean);
    }
    return conv && conv.character ? [conv.character] : [];
}

function getMvuCharacterBags(character) {
    var bags = [];
    if (character && mvuIsObject(character.extensions)) bags.push(character.extensions);
    var raw = character && character.rawCard;
    var payload = raw && mvuIsObject(raw.data) ? raw.data : raw;
    if (payload && mvuIsObject(payload.extensions) && !bags.includes(payload.extensions)) bags.push(payload.extensions);
    return bags;
}

function collectMvuWorldBookEntries(conv) {
    var rows = [], seen = new Set();
    function append(book, name) {
        if (!book || !book.entries) return;
        var entries = Array.isArray(book.entries) ? book.entries : Object.keys(book.entries).map(function(key) { return book.entries[key]; });
        entries.forEach(function(entry) {
            if (!mvuIsObject(entry)) return;
            var key = JSON.stringify([getMvuEntryLabel(entry), String(entry.content || '')]);
            if (seen.has(key)) return;
            seen.add(key);
            rows.push({ entry: cloneMvuRuntimeValue(entry), sourceName: String(name || '') });
        });
    }
    (conv && Array.isArray(conv.worldBookIds) ? conv.worldBookIds : []).forEach(function(id) {
        var books = typeof state !== 'undefined' && state && state.worldBooks;
        var book = books && mvuOwn(books, id) ? books[id] : null;
        append(book, book && book.name || id);
    });
    if (conv && conv.worldInfo) append(conv.worldInfo, conv.worldInfo.name || 'conversation');
    getMvuConversationCharacters(conv).forEach(function(character) {
        var raw = character.rawCard;
        var payload = raw && mvuIsObject(raw.data) ? raw.data : raw;
        append(character.character_book, String(character.name || 'character') + ':embedded');
        append(payload && payload.character_book, String(character.name || 'character') + ':raw');
    });
    return rows;
}

function getMvuWorldInfoEntries(conv) {
    return collectMvuWorldBookEntries(conv).map(function(row) { return row.entry; });
}

function getMvuMainMessages(conv) {
    return (conv && Array.isArray(conv.messages) ? conv.messages : []).filter(function(message) {
        return message && message.role === 'assistant' && message.stage !== 'second';
    });
}

function getMvuSelectedResponseVersion(message) {
    if (!message || !message.selectedResponseVersionId || !Array.isArray(message.responseVersions)) return null;
    return message.responseVersions.find(function(version) {
        return version && version.id === message.selectedResponseVersionId && version.message &&
            getMessageRevision(version.message) === getMessageRevision(message);
    }) || null;
}

function getMvuMessageVersionId(message) {
    return String(message && message.selectedResponseVersionId || 'base:' + String(message && message.id || ''));
}

function buildMvuInitialData(conv, options) {
    options = options || {};
    var data = createEmptyMvuData(), diagnostics = [], sources = [];
    function merge(value, kind, label) {
        var checked = mvuValidateJsonValue(value);
        if (!checked.valid || !mvuIsObject(checked.data)) {
            diagnostics = diagnostics.concat(checked.diagnostics.length ? checked.diagnostics : [mvuDiagnostic('mvu-init-type', '初始变量必须是对象')]);
            return;
        }
        var parsed = checked.data, next = normalizeMvuData(data);
        deepMergeMvuObject(next.stat_data, mvuIsObject(parsed.stat_data) ? parsed.stat_data : parsed);
        if (mvuIsObject(parsed.schema)) deepMergeMvuObject(next.schema, parsed.schema);
        if (mvuIsObject(parsed.initialized_lorebooks)) deepMergeMvuObject(next.initialized_lorebooks, parsed.initialized_lorebooks);
        var id = kind + ':' + sources.length;
        next.initialized_lorebooks[id] = label;
        next.display_data = cloneMvuRuntimeValue(next.stat_data);
        var result = validateMvuData(next);
        if (!result.valid) { diagnostics = diagnostics.concat(result.diagnostics); return; }
        data = result.data;
        sources.push({ kind: kind, label: label });
    }
    function parse(text, kind, label) {
        if (!String(text || '').trim()) return;
        var blocks = extractMvuTaggedBlocks(String(text), 'initvar');
        var payloads = blocks.length ? blocks : [String(text)];
        payloads.forEach(function(payload) {
            var parsed = parseMvuStructuredTextWithDiagnostics(payload);
            diagnostics = diagnostics.concat(parsed.diagnostics.map(function(item) { return Object.assign({}, item, { source: label }); }));
            if (parsed.supported && parsed.value !== null) merge(parsed.value, kind, label);
        });
    }
    collectMvuWorldBookEntries(conv).filter(function(row) { return isMvuInitVarEntry(row.entry); }).forEach(function(row) {
        parse(row.entry.content || '', 'worldbook', row.sourceName + ':' + getMvuEntryLabel(row.entry));
    });
    var characters = options.character ? [options.character] : getMvuConversationCharacters(conv);
    characters.forEach(function(character) {
        getMvuCharacterBags(character).forEach(function(bag) {
            if (mvuIsObject(bag.mvu) && mvuOwn(bag.mvu, 'initvar')) {
                if (typeof bag.mvu.initvar === 'string') parse(bag.mvu.initvar, 'extension', 'extensions.mvu.initvar');
                else merge(bag.mvu.initvar, 'extension', 'extensions.mvu.initvar');
            }
        });
    });
    var firstMessage = getMvuMainMessages(conv)[0], firstVersion = getMvuSelectedResponseVersion(firstMessage);
    var greeting = mvuOwn(options, 'greetingText') ? String(options.greetingText || '')
        : firstMessage && firstMessage.interrupted !== true && !(firstVersion && firstVersion.interrupted) ? String(firstMessage.content || '') : '';
    var greetingBlocks = extractMvuTaggedBlocks(greeting, 'initvar').filter(function(text) { return text.trim(); });
    if (!greetingBlocks.length) {
        var firstCharacter = characters[0], greetings = firstCharacter ? [firstCharacter.first_mes].concat(firstCharacter.alternate_greetings || []) : [];
        if (conv && conv.group && Array.isArray(conv.group.members) && conv.group.members.length >= 2 && firstCharacter) greetings = greetings.concat(firstCharacter.group_only_greetings || []);
        for (var i = 0; i < greetings.length && !greetingBlocks.length; i++) greetingBlocks = extractMvuTaggedBlocks(String(greetings[i] || ''), 'initvar').filter(function(text) { return text.trim(); });
    }
    greetingBlocks.forEach(function(text) { parse(text, 'greeting', 'greeting:<initvar>'); });
    if (!Object.keys(data.stat_data).length) {
        var seenScripts = new Set();
        characters.forEach(function(character) {
            getMvuCharacterBags(character).forEach(function(bag) {
                var helper = mvuIsObject(bag.tavern_helper) ? bag.tavern_helper : bag.TavernHelper;
                (helper && Array.isArray(helper.scripts) ? helper.scripts : []).forEach(function(script) {
                    if (!mvuIsObject(script) || script.enabled === false || typeof script.content !== 'string') return;
                    var key = script.id == null ? script.content : String(script.id);
                    if (seenScripts.has(key)) return;
                    seenScripts.add(key);
                    var parsed = extractMvuDefaultsFromZodSchemaWithDiagnostics(script.content);
                    diagnostics = diagnostics.concat(parsed.diagnostics);
                    if (parsed.supported && parsed.value) merge(parsed.value, 'default', 'zod.schema.default');
                });
            });
        });
    }
    return { data: data, diagnostics: diagnostics, sources: sources };
}

function getMvuInitialResult(conv) {
    var first = getMvuMainMessages(conv)[0], version = getMvuSelectedResponseVersion(first);
    var saved = version && mvuOwn(version, 'mvuInitial') ? version.mvuInitial : conv && conv.mvu && conv.mvu.initial;
    if (saved !== undefined) {
        var checked = validateMvuData(saved);
        if (checked.valid) return { data: checked.data, diagnostics: [], sources: [] };
        var fallback = buildMvuInitialData(conv);
        fallback.diagnostics = checked.diagnostics.concat(fallback.diagnostics);
        return fallback;
    }
    return buildMvuInitialData(conv);
}

function getMvuInitialData(conv) {
    return cloneMvuRuntimeValue(getMvuInitialResult(conv).data);
}
