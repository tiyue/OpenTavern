// Parse large backups one top-level entity at a time; live state is only changed by restore ACK.
function buildSegmentedJsonBlob(data) {
    var blobs = [], pending = [], size = 0;
    function emit(text) {
        pending.push(text); size += text.length;
        if (size >= 4 * 1024 * 1024) { blobs.push(new Blob(pending)); pending = []; size = 0; }
    }
    emit('{');
    var first = true;
    Object.keys(data).forEach(function(key) {
        var value = data[key];
        if (value === undefined) return;
        if (!first) emit(','); first = false;
        emit(JSON.stringify(key) + ':');
        if (key === 'conversations' && Array.isArray(value)) {
            emit('[');
            for (var index = 0; index < value.length; index++) { if (index) emit(','); emit(JSON.stringify(value[index]) || 'null'); }
            emit(']');
        } else if ((key === 'characters' || key === 'worldBooks') && value && typeof value === 'object') {
            emit('{'); Object.keys(value).filter(function(id) { return value[id] !== undefined; }).forEach(function(id, index) { if (index) emit(','); emit(JSON.stringify(id) + ':' + JSON.stringify(value[id])); }); emit('}');
        } else emit(JSON.stringify(value));
    });
    emit('}'); if (pending.length) blobs.push(new Blob(pending));
    return new Blob(blobs, { type: 'application/json' });
}

function createIncrementalBackupParser() {
    var result = {}, state = 'root', field = null, group = null, groupKey = null;
    var token = '', depth = 0, quoted = false, escaped = false, collecting = false, kind = null;
    function own(object, key, value) { Object.defineProperty(object, key, { value: value, enumerable: true, writable: true, configurable: true }); }
    function fail() { throw new Error('备份 JSON 结构无效或不完整。'); }
    function accept(value) {
        if (kind === 'field') {
            if (typeof value !== 'string' || Object.prototype.hasOwnProperty.call(result, value)) fail();
            field = value; state = 'colon';
        } else if (kind === 'groupKey') {
            if (typeof value !== 'string' || Object.prototype.hasOwnProperty.call(group, value)) fail();
            groupKey = value; state = 'groupColon';
        } else if (kind === 'item') {
            if (Array.isArray(group)) group.push(value); else own(group, groupKey, value);
            state = 'groupEnd';
        } else { own(result, field, value); state = 'fieldEnd'; }
    }
    function finish() {
        var value;
        try { value = JSON.parse(token); } catch (_) { fail(); }
        accept(value); token = ''; collecting = false;
    }
    function start(char, type) { kind = type; collecting = true; token = ''; depth = 0; quoted = false; escaped = false; consume(char); }
    function consume(char) {
        token += char;
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') { quoted = false; if (depth === 0) finish(); }
        } else if (char === '"') quoted = true;
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') { depth--; if (depth < 0) fail(); if (depth === 0) finish(); }
    }
    function write(text) {
        for (var i = 0; i < text.length; i++) {
            var char = text[i];
            if (collecting) {
                if (!quoted && depth === 0 && /[\s,}\]]/.test(char)) { finish(); i--; }
                else consume(char);
                continue;
            }
            if (/\s/.test(char) || char === '\uFEFF') continue;
            if (state === 'root') { if (char !== '{') fail(); state = 'field'; }
            else if (state === 'field' || state === 'nextField') {
                if (char === '}' && state === 'field') state = 'done';
                else { if (char !== '"') fail(); start(char, 'field'); }
            } else if (state === 'colon') { if (char !== ':') fail(); state = 'value'; }
            else if (state === 'value') {
                if (field === 'conversations' && char === '[' || (field === 'characters' || field === 'worldBooks') && char === '{') {
                    group = char === '[' ? [] : {}; own(result, field, group); state = 'groupFirst';
                } else start(char, 'value');
            } else if (state === 'groupFirst' || state === 'groupNext') {
                if (char === (Array.isArray(group) ? ']' : '}') && state === 'groupFirst') state = 'fieldEnd';
                else if (Array.isArray(group)) start(char, 'item');
                else { if (char !== '"') fail(); start(char, 'groupKey'); }
            } else if (state === 'groupColon') { if (char !== ':') fail(); state = 'groupValue'; }
            else if (state === 'groupValue') start(char, 'item');
            else if (state === 'groupEnd') {
                if (char === ',') state = 'groupNext';
                else if (char === (Array.isArray(group) ? ']' : '}')) state = 'fieldEnd'; else fail();
            } else if (state === 'fieldEnd') {
                if (char === ',') state = 'nextField'; else if (char === '}') state = 'done'; else fail();
            } else fail();
        }
    }
    return { write: write, finish: function() { if (collecting) finish(); if (state !== 'done') fail(); return result; } };
}

async function forEachTransferTextChunk(file, visit) {
    var decoder = new TextDecoder();
    for (var start = 0; start < file.size; start += 4 * 1024 * 1024) {
        var chunk = await file.slice(start, start + 4 * 1024 * 1024).arrayBuffer();
        visit(decoder.decode(chunk, { stream: true }));
        await new Promise(function(resolve) { setTimeout(resolve, 0); });
    }
    visit(decoder.decode());
}

async function readConversationTransferFile(file) {
    var sample = await file.slice(0, 8192).text(), line = sample.replace(/^\uFEFF/, '').split(/\r?\n/)[0], isJsonl = /\.jsonl$/i.test(file.name || '');
    try { var header = JSON.parse(line); if (header && (header.chat_metadata || header.user_name || typeof header.mes === 'string')) isJsonl = true; } catch (_) {}
    if (isJsonl) {
        var rows = [], buffer = '', lineNumber = 0;
        function readLine(text) {
            lineNumber++; if (!text.trim()) return;
            try { rows.push(JSON.parse(text.replace(/^\uFEFF/, ''))); } catch (_) { throw new Error('JSONL 第 ' + lineNumber + ' 行无效。'); }
        }
        await forEachTransferTextChunk(file, function(text) {
            buffer += text; var lines = buffer.split(/\r?\n/); buffer = lines.pop(); lines.forEach(readLine);
        });
        if (buffer.trim()) readLine(buffer);
        return convertSillyTavernJsonl(rows);
    }
    var parser = createIncrementalBackupParser();
    await forEachTransferTextChunk(file, parser.write);
    return parser.finish();
}

function convertSillyTavernJsonl(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('JSONL 没有聊天消息。');
    var header = rows[0] && typeof rows[0].mes !== 'string' ? rows[0] : {}, records = header === rows[0] ? rows.slice(1) : rows;
    var characterName = String(header.character_name || '导入角色');
    var conv = { id: makeId(), title: characterName + ' · 导入聊天', character: { name: characterName }, messages: [], summaries: [], created: Date.now(), updated: Date.now() };
    records.forEach(function(row, index) {
        if (!row || typeof row !== 'object' || typeof row.mes !== 'string' || typeof row.is_user !== 'boolean' && row.is_system !== true) throw new Error('JSONL 消息 ' + (index + 1) + ' 格式无效。');
        var role = row.is_system ? 'system' : row.is_user ? 'user' : 'assistant';
        var msg = { id: makeId(), role: role, content: row.mes, created: Number.isFinite(Date.parse(row.send_date)) ? Date.parse(row.send_date) : Date.now() };
        if (row.name) msg.speakerName = String(row.name);
        if (row.extra && typeof row.extra.reasoning === 'string') msg.cot = row.extra.reasoning;
        if (Array.isArray(row.swipes) && row.swipes.length) {
            if (row.swipes.some(function(text) { return typeof text !== 'string'; })) throw new Error('JSONL 回复版本格式无效。');
            var selected = Number.isInteger(row.swipe_id) && row.swipe_id >= 0 && row.swipe_id < row.swipes.length ? row.swipe_id : row.swipes.indexOf(row.mes);
            if (role === 'assistant') {
                msg.responseVersions = row.swipes.map(function(text, swipeIndex) {
                    var message = { id: msg.id, role: role, content: text, created: msg.created };
                    var info = Array.isArray(row.swipe_info) && row.swipe_info[swipeIndex];
                    var reasoning = info && info.extra && info.extra.reasoning;
                    if (typeof reasoning === 'string') message.cot = reasoning;
                    else if (swipeIndex === selected && msg.cot) message.cot = msg.cot;
                    return { id: makeId(), created: msg.created, message: message, secondMessages: [] };
                });
                if (selected >= 0) { msg.selectedResponseVersionId = msg.responseVersions[selected].id; msg.content = row.swipes[selected]; }
            } else if (role === 'user') {
                msg.userVersions = row.swipes.map(function(text) { return { id: makeId(), content: text, created: msg.created }; });
                if (selected >= 0) { msg.selectedUserVersionId = msg.userVersions[selected].id; msg.content = row.swipes[selected]; }
            }
        }
        conv.messages.push(msg);
    });
    if (!conv.messages.length) throw new Error('JSONL 没有聊天消息。');
    var note = header.chat_metadata && header.chat_metadata.note_prompt;
    if (typeof note === 'string' && note) conv.authorNoteOverride = { content: note, enabled: true, position: 'after_history', role: 'system', depth: 4, interval: 1 };
    return { version: 1, type: 'opentavern-export', conversations: [conv] };
}
