// Card text is parsed as a small data language, never as JavaScript.
function mvuSyntaxError(message, offset) {
    return mvuDiagnostic('mvu-syntax-unsupported', message, offset);
}

function tokenizeMvuSource(source) {
    var tokens = [], i = 0;
    source = String(source || '');
    if (source.length > MVU_MAX_DATA_BYTES) throw mvuSyntaxError('解析文本过长', 0);
    while (i < source.length) {
        if (/\s/.test(source[i])) { i++; continue; }
        if (source.slice(i, i + 2) === '//') { var newline = source.indexOf('\n', i + 2); i = newline < 0 ? source.length : newline + 1; continue; }
        if (source.slice(i, i + 2) === '/*') { var endComment = source.indexOf('*/', i + 2); if (endComment < 0) throw mvuSyntaxError('注释未闭合', i); i = endComment + 2; continue; }
        var start = i, character = source[i], match, token;
        if (character === '"' || character === "'") {
            var quote = character, value = '', closed = false;
            i++;
            while (i < source.length) {
                character = source[i++];
                if (character === quote) { closed = true; break; }
                if (character === '\n' || character === '\r') throw mvuSyntaxError('字符串不能包含未转义换行', start);
                if (character !== '\\') { value += character; continue; }
                if (i >= source.length) break;
                var escaped = source[i++];
                var escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '/': '/' };
                if (mvuOwn(escapes, escaped)) value += escapes[escaped];
                else if (escaped === 'u' || escaped === 'x') {
                    var size = escaped === 'u' ? 4 : 2, hexadecimal = source.slice(i, i + size);
                    if (!(new RegExp('^[0-9a-f]{' + size + '}$', 'i')).test(hexadecimal)) throw mvuSyntaxError('字符串转义无效', i);
                    value += String.fromCharCode(parseInt(hexadecimal, 16)); i += size;
                } else throw mvuSyntaxError('字符串转义不受支持', i - 2);
            }
            if (!closed) throw mvuSyntaxError('字符串未闭合', start);
            token = { kind: 'string', value: value };
        } else if ((match = source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/))) {
            token = { kind: 'number', value: Number(match[0]) }; i += match[0].length;
            if (!Number.isFinite(token.value)) throw mvuSyntaxError('数字必须有限', start);
        } else if ((match = source.slice(i).match(/^[A-Za-z_$\u0080-\uFFFF][\w$\u0080-\uFFFF]*/))) {
            token = { kind: 'word', value: match[0] }; i += match[0].length;
        } else {
            match = source.slice(i).match(/^(===|!==|==|!=|<=|>=|=>|\|\||&&|\?\?)/);
            token = { kind: 'punct', value: match ? match[0] : character }; i += match ? match[0].length : 1;
        }
        token.start = start; token.end = i; tokens.push(token);
        if (tokens.length > MVU_MAX_NODES) throw mvuSyntaxError('解析节点过多', start);
    }
    return tokens;
}

function mvuReadLiteralTokens(tokens, position, depth) {
    if (depth > MVU_MAX_DEPTH) throw mvuSyntaxError('字面值超过 32 层深度上限', tokens[position] && tokens[position].start);
    var token = tokens[position];
    if (!token) throw mvuSyntaxError('缺少字面值', 0);
    if (token.kind === 'string' || token.kind === 'number') return { value: token.value, next: position + 1 };
    if (token.value === 'true' || token.value === 'false' || token.value === 'null') return { value: token.value === 'null' ? null : token.value === 'true', next: position + 1 };
    if (token.value !== '[' && token.value !== '{') throw mvuSyntaxError('只支持 JSON 或引号字面值', token.start);
    var array = token.value === '[', value = array ? [] : {}, closing = array ? ']' : '}', cursor = position + 1;
    if (tokens[cursor] && tokens[cursor].value === closing) return { value: value, next: cursor + 1 };
    while (cursor < tokens.length) {
        var key;
        if (!array) {
            if (tokens[cursor].kind !== 'string') throw mvuSyntaxError('对象属性名必须带引号；不支持 JSON5 对象语法', tokens[cursor].start);
            key = tokens[cursor++].value;
            if (mvuUnsafeKey(key) || mvuOwn(value, key)) throw mvuSyntaxError('对象属性名危险或重复', tokens[cursor - 1].start);
            if (!tokens[cursor] || tokens[cursor++].value !== ':') throw mvuSyntaxError('对象属性缺少冒号', token.start);
        }
        var item = mvuReadLiteralTokens(tokens, cursor, depth + 1);
        cursor = item.next;
        if (array) value.push(item.value); else value[key] = item.value;
        if (!tokens[cursor]) break;
        if (tokens[cursor].value === closing) return { value: value, next: cursor + 1 };
        if (tokens[cursor++].value !== ',' || !tokens[cursor] || tokens[cursor].value === closing) throw mvuSyntaxError('字面值分隔无效', token.start);
    }
    throw mvuSyntaxError('字面值未闭合', token.start);
}

function parseMvuLiteral(source) {
    try {
        var tokens = tokenizeMvuSource(source), parsed = mvuReadLiteralTokens(tokens, 0, 0);
        if (parsed.next !== tokens.length) return undefined;
        var result = mvuValidateJsonValue(parsed.value);
        return result.valid ? result.data : undefined;
    } catch (_) { return undefined; }
}
