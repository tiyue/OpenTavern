
function mvuLookupTemplateWorldInfo(worldInfo, name) {
    if (typeof worldInfo === 'function') return worldInfo(name);
    var entries = Array.isArray(worldInfo) ? worldInfo : (worldInfo && worldInfo.entries ? worldInfo.entries : worldInfo);
    if (!entries || typeof entries !== 'object') return undefined;
    if (!Array.isArray(entries)) entries = Object.keys(entries).map(function(key) { return entries[key]; });
    var exact, partial;
    entries.forEach(function(row) {
        var entry = row && (row.entry || row);
        if (!entry || typeof entry !== 'object') return;
        var label = getMvuEntryLabel(entry), keys = Array.isArray(entry.keys || entry.key) ? (entry.keys || entry.key).join('\n') : String(entry.keys || entry.key || '');
        if (label === name || keys === name) exact = entry;
        else if (!partial && (label.indexOf(name) >= 0 || keys.indexOf(name) >= 0)) partial = entry;
    });
    var entry = exact || partial;
    return entry ? String(entry.content || '') : undefined;
}

function renderDeclarativeTemplateSubset(text, data, options) {
    var source = String(text || ''), parsed = parseDeclarativeTemplateSubset(source), checked = validateMvuData(data), opts = options || {};
    if (!parsed.supported) return { output: source, supported: false, diagnostics: parsed.diagnostics };
    if (!checked.valid) return { output: source, supported: false, diagnostics: checked.diagnostics };
    var current = checked.data, locals = Object.create(null), output = '';
    function expression(node) {
        if (node.type === 'literal') return node.value;
        if (node.type === 'get') { var value = lookupMvuTemplateValue(current, node.path); return typeof value === 'undefined' ? node.fallback : value; }
        if (node.type === 'number') {
            var number = Number(expression(node.source));
            return Number.isFinite(number) && (!node.useOr || number !== 0) ? number : node.fallback;
        }
        if (node.type === 'local') {
            if (mvuOwn(locals, node.name)) return locals[node.name];
            if (['stat_data', 'stat', 'data', 'd'].indexOf(node.name) >= 0) return current.stat_data;
            throw mvuTemplateError('未声明局部变量：' + node.name, 0);
        }
        if (node.type === 'property') { var property = getMvuPathValue(expression(node.root), node.path); return typeof property === 'undefined' ? node.fallback : property; }
        if (node.type === 'worldinfo') {
            var content = mvuLookupTemplateWorldInfo(opts.worldInfo, node.name);
            if (typeof content !== 'string') throw mvuDiagnostic('template-worldinfo-missing', '未找到世界书条目：' + node.name, 0);
            return content;
        }
        throw mvuTemplateError('未知模板节点', 0);
    }
    function condition(node) {
        var left = expression(node.left), right = node.right, value;
        if (!node.op) value = !!left;
        else if (node.op === '===' || node.op === '==') value = left === right;
        else if (node.op === '!==' || node.op === '!=') value = left !== right;
        else {
            if (left !== null && typeof left === 'object') throw mvuTemplateError('条件不能比较对象大小', 0);
            if (node.op === '<') value = left < right;
            else if (node.op === '<=') value = left <= right;
            else if (node.op === '>') value = left > right;
            else value = left >= right;
        }
        return node.negate ? !value : value;
    }
    function serialize(value, escape) {
        var result = typeof value === 'undefined' ? '' : (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value));
        return escape ? result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : result;
    }
    function append(text) {
        if (output.length + text.length > MVU_TEMPLATE_OUTPUT_LIMIT) throw mvuDiagnostic('template-output-limit', '模板输出超过 200000 字符上限', 0);
        output += text;
    }
    function script(nodes) {
        nodes.forEach(function(node) {
            if (node.type === 'declare') {
                if (mvuOwn(locals, node.name)) throw mvuTemplateError('局部变量重复声明：' + node.name, 0);
                locals[node.name] = expression(node.expression);
            } else if (node.type === 'assign') {
                if (!mvuOwn(locals, node.name)) throw mvuTemplateError('赋值变量尚未声明：' + node.name, 0);
                locals[node.name] = node.value;
            } else if (node.type === 'if') script(condition(node.condition) ? node.consequent : node.alternate);
        });
    }
    function render(nodes) {
        nodes.forEach(function(node) {
            if (node.type === 'text') {
                if (/\{\{\s*(?:getvar|get_message_variable|format_message_variable)\s*::/i.test(node.value.replace(/\{\{\s*(?:getvar|get_message_variable|format_message_variable)\s*::[^}]+\}\}/gi, ''))) throw mvuTemplateError('变量宏未闭合', 0);
                var value = node.value.replace(/\{\{\s*(?:getvar|get_message_variable|format_message_variable)\s*::([^}]+)\}\}/gi, function(_, path) {
                    path = path.trim();
                    if (!parseMvuPath(path)) throw mvuTemplateError('双花括号变量路径无效', 0);
                    return serialize(lookupMvuTemplateValue(current, path), opts.escapeValues === true);
                });
                append(value);
            } else if (node.type === 'value') append(serialize(expression(node.expression), opts.escapeValues === true && node.expression.type !== 'worldinfo'));
            else if (node.type === 'script') script(node.statements);
            else if (node.type === 'if') render(condition(node.condition) ? node.consequent : node.alternate);
        });
    }
    try { render(parsed.nodes); return { output: output, supported: true, diagnostics: [] }; }
    catch (error) { return { output: source, supported: false, diagnostics: [error && error.code ? error : mvuTemplateError('模板无法渲染', 0)] }; }
}
