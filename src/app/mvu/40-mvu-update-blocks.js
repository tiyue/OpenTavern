
function extractMvuTaggedBlocks(text, tag) {
    if (!/^(?:initvar|UpdateVariable|JSONPatch|json_patch)$/i.test(String(tag))) return [];
    var source = String(text || ''), pattern = new RegExp('<(\\/?)' + tag + '\\b[^>]*>', 'gi'), blocks = [], stack = [], markers = 0, match;
    if (mvuUtf8Length(source) > MVU_MAX_DATA_BYTES) return [];
    while ((match = pattern.exec(source))) {
        if (++markers > 1024 || stack.length > MVU_MAX_DEPTH) return [];
        if (!match[1]) stack.push(pattern.lastIndex);
        else if (stack.length) { var start = stack.pop(); if (!stack.length) blocks.push(source.slice(start, match.index)); }
    }
    return blocks;
}

function stripMvuControlBlocks(text) {
    var source = String(text || '');
    if (mvuUtf8Length(source) > MVU_MAX_DATA_BYTES) return source;
    var blocks = mvuCollectControlBlocks(source).blocks, output = '', cursor = 0;
    blocks.forEach(function(block) { output += source.slice(cursor, block.index); cursor = block.end; });
    return (output + source.slice(cursor)).trim();
}

function mvuCollectControlBlocks(content) {
    var blocks = [], diagnostics = [], stack = [], markers = 0, pattern = /<(\/?)(initvar|UpdateVariable|JSONPatch|json_patch)\b[^>]*>/gi, match;
    while ((match = pattern.exec(content))) {
        if (++markers > 1024 || stack.length > MVU_MAX_DEPTH) return { blocks: [], diagnostics: [mvuDiagnostic('mvu-block-limit', '消息控制标记或嵌套过多', match.index)] };
        var type = match[2].toLowerCase();
        if (!match[1]) { stack.push({ type: type, index: match.index, start: pattern.lastIndex, children: [] }); continue; }
        var opening = stack[stack.length - 1];
        if (!opening || opening.type !== type) { diagnostics.push(mvuSyntaxError('控制块结束标记无法匹配：' + type, match.index)); continue; }
        stack.pop();
        var block = { type: type, content: content.slice(opening.start, match.index), index: opening.index, end: pattern.lastIndex };
        if (stack.length) stack[stack.length - 1].children.push(block); else blocks.push(block);
        if (blocks.length > MVU_MAX_OPERATIONS) return { blocks: [], diagnostics: [mvuDiagnostic('mvu-block-limit', '消息控制块超过 256 个上限', match.index)] };
    }
    stack.forEach(function(opening) { diagnostics.push(mvuSyntaxError('控制块未闭合：' + opening.type, opening.index)); blocks = blocks.concat(opening.children); });
    blocks.sort(function(a, b) { return a.index - b.index; });
    return { blocks: blocks, diagnostics: diagnostics };
}

function mvuParseUpdateBlock(text) {
    var source = String(text).trim();
    if (/^```(?:json|yaml)?\s*\n[\s\S]*\n```$/i.test(source)) source = source.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '').trim();
    source = source.replace(/^<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch\s*>/i, '$1').replace(/^<json_patch\b[^>]*>([\s\S]*?)<\/json_patch\s*>/i, '$1');
    var tokens = tokenizeMvuSource(source), cursor = 0, patches = [], sets = [], recognized = false;
    if (tokens[0] && ['_', '[', '{'].indexOf(tokens[0].value) < 0) {
        var structured = parseMvuStructuredTextWithDiagnostics(source);
        if (!structured.supported) throw structured.diagnostics[0];
        patches = Array.isArray(structured.value) ? structured.value : (structured.value && (structured.value.patches || structured.value.jsonpatch));
        if (!Array.isArray(patches)) throw mvuSyntaxError('更新块需要 Patch 数组或三参数 _.set', 0);
        recognized = true;
        cursor = tokens.length;
    }
    while (cursor < tokens.length) {
        var start = tokens[cursor].start;
        if (tokens[cursor].value === '[' || tokens[cursor].value === '{') {
            var parsed = mvuReadLiteralTokens(tokens, cursor, 0), payload;
            try { payload = JSON.parse(source.slice(start, tokens[parsed.next - 1].end)); } catch (_) { throw mvuSyntaxError('Patch JSON 无效；JSON5 扩展尚未支持', start); }
            var list = Array.isArray(payload) ? payload : (mvuIsObject(payload) && Array.isArray(payload.patches) ? payload.patches : (mvuIsObject(payload) && Array.isArray(payload.jsonpatch) ? payload.jsonpatch : null));
            if (!list) throw mvuSyntaxError('更新对象需要 patches 或 jsonpatch 数组', start);
            recognized = true;
            patches = patches.concat(list); cursor = parsed.next;
            if (tokens[cursor] && tokens[cursor].value === ';') cursor++;
            if (patches.length + sets.length > MVU_MAX_OPERATIONS) throw mvuDiagnostic('mvu-operation-limit', '更新块超过 256 操作上限', start);
            continue;
        }
        ['_', '.', 'set', '('].forEach(function(expected) { if (!tokens[cursor] || tokens[cursor++].value !== expected) throw mvuSyntaxError('只支持三参数 _.set 更新', start); });
        var path = mvuReadLiteralTokens(tokens, cursor, 0); cursor = path.next;
        if (typeof path.value !== 'string' || !parseMvuPath(path.value)) throw mvuSyntaxError('set 路径无效', start);
        if (!tokens[cursor] || tokens[cursor++].value !== ',') throw mvuSyntaxError('set 需要三个参数', start);
        var previous = mvuReadLiteralTokens(tokens, cursor, 0); cursor = previous.next;
        if (!tokens[cursor] || tokens[cursor++].value !== ',') throw mvuSyntaxError('set 需要三个参数', start);
        var next = mvuReadLiteralTokens(tokens, cursor, 0); cursor = next.next;
        if (!tokens[cursor] || tokens[cursor].value !== ')') throw mvuSyntaxError('set 仅支持三个字面值参数', start);
        var close = tokens[cursor++].end;
        if (tokens[cursor] && tokens[cursor].value === ';') cursor++;
        var line = source.slice(close, source.indexOf('\n', close) < 0 ? source.length : source.indexOf('\n', close));
        var reason = line.match(/^\s*;?\s*\/\/\s*(.*)$/);
        sets.push({ type: 'set', path: path.value, oldValue: previous.value, newValue: next.value, reason: reason ? reason[1] : '' });
        recognized = true;
        if (patches.length + sets.length > MVU_MAX_OPERATIONS) throw mvuDiagnostic('mvu-operation-limit', '更新块超过 256 操作上限', start);
    }
    if (!recognized) throw mvuSyntaxError('更新块没有可识别操作', 0);
    if (patches.length + sets.length > MVU_MAX_OPERATIONS) throw mvuDiagnostic('mvu-operation-limit', '更新块超过 256 操作上限', 0);
    return { patches: patches, sets: sets };
}
