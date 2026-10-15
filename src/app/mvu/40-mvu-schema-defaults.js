
function extractMvuDefaultsFromZodSchemaWithDiagnostics(source) {
    var text = String(source || ''), diagnostics = [];
    if (mvuUtf8Length(text) > MVU_MAX_DATA_BYTES) return { value: null, supported: false, diagnostics: [mvuDiagnostic('mvu-schema-limit', '静态 schema 文本过长', 0)] };
    try {
        var tokens = tokenizeMvuSource(text), start = -1;
        for (var i = 0; i + 3 < tokens.length; i++) if (tokens[i].kind === 'word' && tokens[i].value === 'z' && tokens[i + 1].value === '.' && tokens[i + 2].value === 'object' && tokens[i + 3].value === '(' && tokens[i + 4] && tokens[i + 4].value === '{') { start = i; break; }
        if (start < 0) return { value: null, supported: false, diagnostics: [mvuSyntaxError('未找到静态 z.object', 0)] };
        function defaults(position, depth) {
            if (depth > MVU_MAX_DEPTH) throw mvuSyntaxError('静态 schema 超过深度上限', tokens[position].start);
            var result = {}, cursor = position + 5;
            while (cursor < tokens.length && tokens[cursor].value !== '}') {
                var key = tokens[cursor++];
                if ((key.kind !== 'word' && key.kind !== 'string') || mvuUnsafeKey(key.value) || mvuOwn(result, key.value)) throw mvuSyntaxError('静态 schema 属性名无效', key.start);
                if (!tokens[cursor] || tokens[cursor++].value !== ':') throw mvuSyntaxError('静态 schema 属性缺少冒号', key.start);
                var valueStart = cursor, nesting = [], end = cursor;
                for (; end < tokens.length; end++) {
                    var token = tokens[end].value;
                    if ((token === ',' || token === '}') && !nesting.length) break;
                    if (token === '(' || token === '{' || token === '[') nesting.push(token);
                    else if (token === ')' || token === '}' || token === ']') { if (!nesting.length) break; var open = nesting.pop(); if ({ ')': '(', '}': '{', ']': '[' }[token] !== open) throw mvuSyntaxError('静态 schema 括号不匹配', tokens[end].start); }
                }
                var nested = tokens[valueStart] && tokens[valueStart].value === 'z' && tokens[valueStart + 1] && tokens[valueStart + 1].value === '.' && tokens[valueStart + 2] && tokens[valueStart + 2].value === 'object' && tokens[valueStart + 4] && tokens[valueStart + 4].value === '{';
                if (nested) {
                    var child = defaults(valueStart, depth + 1);
                    if (Object.keys(child).length) result[key.value] = child;
                } else {
                    for (var j = valueStart; j + 2 < end; j++) {
                        if (tokens[j].value !== '.' || ['default', 'prefault'].indexOf(tokens[j + 1].value) < 0 || tokens[j + 2].value !== '(') continue;
                        try {
                            var literal = mvuReadLiteralTokens(tokens, j + 3, depth + 1);
                            if (!tokens[literal.next] || tokens[literal.next].value !== ')') throw mvuSyntaxError('默认值必须是静态字面量', tokens[j].start);
                            result[key.value] = literal.value;
                        } catch (error) { diagnostics.push(error); }
                        break;
                    }
                }
                cursor = end;
                if (tokens[cursor] && tokens[cursor].value === ',') cursor++;
            }
            if (!tokens[cursor] || tokens[cursor].value !== '}' || !tokens[cursor + 1] || tokens[cursor + 1].value !== ')') throw mvuSyntaxError('静态 z.object 未闭合', tokens[position].start);
            return result;
        }
        var value = defaults(start, 0), result = mvuValidateJsonValue(value);
        if (!result.valid) return { value: null, supported: false, diagnostics: diagnostics.concat(result.diagnostics) };
        return { value: Object.keys(value).length ? result.data : null, supported: diagnostics.length === 0 && Object.keys(value).length > 0, diagnostics: diagnostics };
    } catch (error) { return { value: null, supported: false, diagnostics: [error && error.code ? error : mvuSyntaxError('静态 schema 无法解析', 0)] }; }
}

function extractMvuDefaultsFromZodSchema(source) {
    return extractMvuDefaultsFromZodSchemaWithDiagnostics(source).value;
}
