
function mvuParseTemplateStatements(tokens) {
    tokens = mvuUnwrapTemplateIife(tokens);
    var cursor = 0, count = 0;
    function statements(depth, braced) {
        if (depth > MVU_TEMPLATE_DEPTH_LIMIT) throw mvuTemplateError('局部条件超过 8 层上限', tokens[cursor] && tokens[cursor].start);
        var nodes = [];
        while (cursor < tokens.length && (!braced || tokens[cursor].value !== '}')) {
            var token = tokens[cursor++], node;
            if (token.value === ';') continue;
            if (['const', 'let', 'var'].indexOf(token.value) >= 0) {
                var name = tokens[cursor++];
                if (!name || name.kind !== 'word' || mvuUnsafeKey(name.value) || !tokens[cursor] || tokens[cursor++].value !== '=') throw mvuTemplateError('局部声明只支持安全变量和赋值', token.start);
                var expression = mvuReadTemplateExpression(tokens, cursor, 0); cursor = expression.next;
                if (expression.node.type === 'worldinfo') throw mvuTemplateError('局部声明不支持世界书查询', token.start);
                node = { type: 'declare', name: name.value, expression: expression.node };
            } else if (token.value === 'define') {
                if (!tokens[cursor] || tokens[cursor++].value !== '(' || !tokens[cursor] || tokens[cursor].kind !== 'string') throw mvuTemplateError('define 只支持字面量名称及变量读取', token.start);
                var defined = tokens[cursor++].value;
                if (!/^[A-Za-z_$][\w$]*$/.test(defined) || mvuUnsafeKey(defined) || !tokens[cursor] || tokens[cursor++].value !== ',') throw mvuTemplateError('define 名称无效', token.start);
                var definedExpression = mvuReadTemplateExpression(tokens, cursor, 0); cursor = definedExpression.next;
                if (definedExpression.node.type !== 'get' || !tokens[cursor] || tokens[cursor++].value !== ')') throw mvuTemplateError('define 只支持变量读取', token.start);
                node = { type: 'declare', name: defined, expression: definedExpression.node };
            } else if (token.value === 'if') {
                node = conditional(token, depth);
            } else if (token.kind === 'word' && !mvuUnsafeKey(token.value)) {
                if (!tokens[cursor] || tokens[cursor++].value !== '=' || !tokens[cursor] || tokens[cursor].kind !== 'string') throw mvuTemplateError('局部赋值只支持已声明变量和字符串', token.start);
                node = { type: 'assign', name: token.value, value: tokens[cursor++].value };
            } else throw mvuTemplateError('模板语句不受支持', token.start);
            if (++count > MVU_TEMPLATE_NODE_LIMIT) throw mvuTemplateError('局部语句超过 256 个上限', token.start);
            nodes.push(node);
            if (tokens[cursor] && tokens[cursor].value === ';') cursor++;
            else if (tokens[cursor] && ['}', 'else'].indexOf(tokens[cursor].value) < 0) throw mvuTemplateError('局部语句之间需要分号', tokens[cursor].start);
            if (!braced && nodes.length && tokens[cursor] && tokens[cursor].value === 'else') break;
        }
        return nodes;
    }
    function branch(depth) {
        if (tokens[cursor] && tokens[cursor].value === '{') {
            cursor++; var body = statements(depth + 1, true);
            if (!tokens[cursor] || tokens[cursor++].value !== '}') throw mvuTemplateError('局部条件未闭合', 0);
            return body;
        }
        var name = tokens[cursor++];
        if (!name || name.kind !== 'word' || mvuUnsafeKey(name.value) || !tokens[cursor] || tokens[cursor++].value !== '=' || !tokens[cursor] || tokens[cursor].kind !== 'string') throw mvuTemplateError('局部条件只支持字符串赋值', name && name.start);
        var value = tokens[cursor++].value;
        if (tokens[cursor] && tokens[cursor].value === ';') cursor++;
        return [{ type: 'assign', name: name.value, value: value }];
    }
    function conditional(token, depth) {
        if (!tokens[cursor] || tokens[cursor++].value !== '(') throw mvuTemplateError('局部条件缺少括号', token.start);
        var parsed = mvuReadTemplateCondition(tokens, cursor); cursor = parsed.next;
        if (!tokens[cursor] || tokens[cursor++].value !== ')') throw mvuTemplateError('局部条件不受支持', token.start);
        var node = { type: 'if', condition: parsed.condition, consequent: branch(depth), alternate: [] };
        if (tokens[cursor] && tokens[cursor].value === 'else') {
            cursor++;
            if (tokens[cursor] && tokens[cursor].value === 'if') { var nextIf = tokens[cursor++]; if (depth >= MVU_TEMPLATE_DEPTH_LIMIT) throw mvuTemplateError('局部条件超过 8 层上限', token.start); node.alternate = [conditional(nextIf, depth + 1)]; }
            else node.alternate = branch(depth);
        }
        return node;
    }
    var nodes = statements(0, false);
    if (cursor !== tokens.length || !nodes.length) throw mvuTemplateError('模板语句不受支持', tokens[cursor] && tokens[cursor].start);
    var pending = nodes.slice(), total = 0;
    while (pending.length) {
        var node = pending.pop();
        if (++total > MVU_TEMPLATE_NODE_LIMIT) throw mvuTemplateError('局部语句超过 256 个上限', 0);
        if (node.type === 'if') pending = pending.concat(node.consequent, node.alternate);
    }
    return { nodes: nodes, count: total };
}

function parseDeclarativeTemplateSubset(text) {
    var source = String(text || ''), diagnostics = [], root = [], stack = [{ children: root }], cursor = 0, count = 0;
    if (source.length > MVU_TEMPLATE_INPUT_LIMIT) return { supported: false, nodes: [], diagnostics: [mvuDiagnostic('template-input-limit', '模板超过 100000 字符上限', 0)] };
    function append(node, extra) {
        count += 1 + (extra || 0);
        if (count > MVU_TEMPLATE_NODE_LIMIT) throw mvuDiagnostic('template-node-limit', '模板节点超过 256 个上限', cursor);
        stack[stack.length - 1].children.push(node);
    }
    try {
        while (cursor < source.length) {
            var open = source.indexOf('<%', cursor);
            if (open < 0) { append({ type: 'text', value: source.slice(cursor) }); cursor = source.length; break; }
            if (open > cursor) append({ type: 'text', value: source.slice(cursor, open) });
            var close = source.indexOf('%>', open + 2);
            if (close < 0) throw mvuDiagnostic('template-unclosed-token', '模板标记未闭合', open);
            var body = source.slice(open + 2, close), marker = '';
            if (/^[_=-]/.test(body)) { marker = body[0]; body = body.slice(1); }
            body = body.replace(/[_-]$/, '').trim();
            var tokens = tokenizeMvuSource(body), first = tokens[0], header = 0, isElse = false, control = null;
            if (!first) throw mvuTemplateError('模板标记为空', open);
            if (first.value === '}') header++;
            if (tokens[header] && tokens[header].value === 'else') { isElse = true; header++; }
            if (tokens[header] && tokens[header].value === 'if') {
                var position = header + 1;
                if (!tokens[position] || tokens[position++].value !== '(') throw mvuTemplateError('模板条件缺少括号', open);
                var condition = mvuReadTemplateCondition(tokens, position); position = condition.next;
                if (!tokens[position] || tokens[position++].value !== ')') throw mvuTemplateError('模板条件不受支持', open);
                if (tokens[position] && tokens[position].value === '{') position++;
                if (position === tokens.length) control = { condition: condition.condition, isElse: isElse };
            }
            if (marker === '=' || marker === '-') {
                var interpolation = mvuReadTemplateExpression(tokens, 0, 0);
                if (interpolation.next !== tokens.length) throw mvuTemplateError('模板插值不支持计算或调用', open);
                append({ type: 'value', expression: interpolation.node });
            } else if (control) {
                var ifNode = { type: 'if', condition: control.condition, consequent: [], alternate: [] };
                if (control.isElse) {
                    if (stack.length === 1 || stack[stack.length - 1].inElse) throw mvuTemplateError('else if 没有对应条件', open);
                    count++; if (count > MVU_TEMPLATE_NODE_LIMIT) throw mvuTemplateError('模板节点过多', open);
                    stack[stack.length - 1].node.alternate.push(ifNode);
                    stack[stack.length - 1] = { node: ifNode, children: ifNode.consequent, inElse: false };
                } else {
                    if (stack.length > MVU_TEMPLATE_DEPTH_LIMIT) throw mvuDiagnostic('template-depth-limit', '模板条件超过 8 层上限', open);
                    append(ifNode); stack.push({ node: ifNode, children: ifNode.consequent, inElse: false });
                }
            } else if (/^\}?\s*else\s*\{?$/.test(body)) {
                if (stack.length === 1 || stack[stack.length - 1].inElse) throw mvuTemplateError('else 没有对应条件', open);
                stack[stack.length - 1].children = stack[stack.length - 1].node.alternate; stack[stack.length - 1].inElse = true;
            } else if (body === '}') {
                if (stack.length === 1) throw mvuTemplateError('多余的模板结束标记', open);
                stack.pop();
            } else if (first.value === 'getwi' || first.value === 'await' || first.value === 'getvar' || first.value === 'get_message_variable') {
                var bare = mvuReadTemplateExpression(tokens, 0, 0);
                if (bare.next !== tokens.length) throw mvuTemplateError('模板插值表达式不受支持', open);
                append({ type: 'value', expression: bare.node });
            } else {
                var script = mvuParseTemplateStatements(tokens);
                append({ type: 'script', statements: script.nodes }, script.count);
            }
            cursor = close + 2;
        }
        if (stack.length !== 1) throw mvuDiagnostic('template-unclosed-if', '模板条件块未闭合', cursor);
        return { supported: true, nodes: root, diagnostics: [] };
    } catch (error) {
        diagnostics.push(error && error.code ? error : mvuTemplateError('模板无法解析', cursor));
        return { supported: false, nodes: [], diagnostics: diagnostics };
    }
}
