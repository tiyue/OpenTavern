
function mvuYamlKeyValue(text) {
    var quote = '', escaped = false, depth = 0;
    for (var i = 0; i < text.length; i++) {
        var character = text[i];
        if (quote) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === quote) quote = ''; continue; }
        if (character === '"' || character === "'") quote = character;
        else if (character === '[' || character === '{') depth++;
        else if (character === ']' || character === '}') depth--;
        else if (character === ':' && depth === 0 && (i === text.length - 1 || /\s/.test(text[i + 1]))) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
    return null;
}

function mvuYamlStripComment(text) {
    var quote = '', escaped = false;
    for (var i = 0; i < text.length; i++) {
        var character = text[i];
        if (quote) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
    }
    return text.trimEnd();
}

function parseMvuIndentYaml(text) {
    var rows = [], cursor = 0, offset = 0;
    String(text).replace(/\r\n?/g, '\n').split('\n').forEach(function(line) {
        var start = offset; offset += line.length + 1;
        if (/^\s*#/.test(line) || !line.trim()) return;
        if (/^\s*\t|^ *\t/.test(line)) throw mvuSyntaxError('YAML 缩进不支持制表符', start);
        line = mvuYamlStripComment(line);
        if (!line.trim() || line.trim() === '---' || line.trim() === '...') return;
        var indent = line.match(/^ */)[0].length, body = line.slice(indent);
        if (body.slice(0, 2) === '- ' && mvuYamlKeyValue(body.slice(2))) {
            rows.push({ indent: indent, text: '-', offset: start });
            rows.push({ indent: indent + 2, text: body.slice(2), offset: start + indent + 2 });
        } else rows.push({ indent: indent, text: body, offset: start + indent });
        if (rows.length > MVU_MAX_NODES) throw mvuSyntaxError('YAML 行数过多', start);
    });
    function scalar(raw, row) {
        if (!raw) return null;
        if (/^[!&*]|^(?:\||>)[+-]?\d*$/.test(raw) || /(?:^|\s)[&*][\w-]+/.test(raw)) throw mvuSyntaxError('YAML 标签、别名和块字符串不在支持子集中', row.offset);
        if (/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/i.test(raw)) {
            var parsedScalar = parseMvuLiteral(raw.toLowerCase());
            if (typeof parsedScalar === 'undefined') throw mvuSyntaxError('YAML 标量无效', row.offset);
            return parsedScalar;
        }
        if (/^(?:NaN|[+-]?Infinity|\.nan|[+-]?\.inf)$/i.test(raw)) throw mvuSyntaxError('YAML 数字必须有限', row.offset);
        if (/^[\[\{"']/.test(raw)) {
            var parsedLiteral = parseMvuLiteral(raw);
            if (typeof parsedLiteral === 'undefined') throw mvuSyntaxError('YAML 内联值只支持 JSON 与引号字面值', row.offset);
            return parsedLiteral;
        }
        return raw;
    }
    function container(indent, depth) {
        if (depth > MVU_MAX_DEPTH) throw mvuSyntaxError('YAML 超过 32 层深度上限', rows[cursor].offset);
        var array = /^-(?:\s|$)/.test(rows[cursor].text), output = array ? [] : {};
        while (cursor < rows.length && rows[cursor].indent >= indent) {
            var row = rows[cursor];
            if (row.indent !== indent) throw mvuSyntaxError('YAML 缩进无效', row.offset);
            var isItem = /^-(?:\s|$)/.test(row.text);
            if (isItem !== array) throw mvuSyntaxError('YAML 不能混合对象和序列', row.offset);
            var key, body;
            if (array) body = row.text.slice(1).trim();
            else {
                var pair = mvuYamlKeyValue(row.text);
                if (!pair) throw mvuSyntaxError('YAML 需要键值项', row.offset);
                key = pair[0]; body = pair[1];
                if (/^["']/.test(key)) key = parseMvuLiteral(key);
                if (typeof key !== 'string' || !key || mvuUnsafeKey(key) || mvuOwn(output, key)) throw mvuSyntaxError('YAML 属性名危险或重复', row.offset);
            }
            cursor++;
            var value;
            if (!body && cursor < rows.length && rows[cursor].indent > indent) value = container(rows[cursor].indent, depth + 1);
            else {
                value = scalar(body, row);
                if (cursor < rows.length && rows[cursor].indent > indent) throw mvuSyntaxError('YAML 标量后不能继续缩进', rows[cursor].offset);
            }
            if (array) output.push(value); else output[key] = value;
        }
        return output;
    }
    return rows.length ? container(rows[0].indent, 0) : null;
}

function parseMvuStructuredTextWithDiagnostics(text) {
    var source = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!source) return { value: null, supported: false, diagnostics: [mvuSyntaxError('初始化或更新数据为空', 0)] };
    if (mvuUtf8Length(source) > MVU_MAX_DATA_BYTES) return { value: null, supported: false, diagnostics: [mvuDiagnostic('mvu-data-limit', '解析文本超过 1 MiB UTF-8 上限', 0)] };
    try {
        var value;
        if (/^[\[{]/.test(source)) {
            try { value = JSON.parse(source); } catch (_) { throw mvuSyntaxError('JSON 无效；JSON5 扩展语法尚未支持', 0); }
        } else value = parseMvuIndentYaml(source);
        var result = mvuValidateJsonValue(value);
        return { value: result.valid ? result.data : null, supported: result.valid, diagnostics: result.diagnostics };
    } catch (error) {
        return { value: null, supported: false, diagnostics: [error && error.code ? error : mvuSyntaxError('结构化文本无法解析', 0)] };
    }
}

function parseMvuStructuredText(text) {
    return parseMvuStructuredTextWithDiagnostics(text).value;
}
