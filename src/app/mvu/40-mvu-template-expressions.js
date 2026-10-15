var MVU_TEMPLATE_INPUT_LIMIT = 100000;
var MVU_TEMPLATE_OUTPUT_LIMIT = 200000;
var MVU_TEMPLATE_NODE_LIMIT = 256;
var MVU_TEMPLATE_DEPTH_LIMIT = 8;

function mvuTemplateError(message, offset) {
    return mvuDiagnostic('template-expression-unsupported', message, offset);
}

function lookupMvuTemplateValue(data, path) {
    var value = getMvuPathValue(data, path);
    return typeof value === 'undefined' ? getMvuPathValue(data.stat_data, path) : value;
}

function mvuReadTemplateExpression(tokens, position, depth) {
    if (depth > MVU_MAX_DEPTH) throw mvuTemplateError('模板表达式过深', tokens[position] && tokens[position].start);
    var token = tokens[position], cursor = position, node;
    if (!token) throw mvuTemplateError('缺少模板表达式', 0);
    if (token.value === 'await') { cursor++; token = tokens[cursor]; if (!token || token.value !== 'getwi') throw mvuTemplateError('await 只支持字面量 getwi 查询', token && token.start); }
    if (token.kind === 'string' || token.kind === 'number' || ['true', 'false', 'null'].indexOf(token.value) >= 0) {
        var literal = mvuReadLiteralTokens(tokens, cursor, depth); node = { type: 'literal', value: literal.value }; cursor = literal.next;
    } else if (token.value === 'Number') {
        if (!tokens[++cursor] || tokens[cursor++].value !== '(') throw mvuTemplateError('Number 需要 getvar 参数', token.start);
        var numeric = mvuReadTemplateExpression(tokens, cursor, depth + 1); cursor = numeric.next;
        if (numeric.node.type !== 'get' || !tokens[cursor] || tokens[cursor++].value !== ')') throw mvuTemplateError('Number 只支持 getvar 读取', token.start);
        node = { type: 'number', source: numeric.node, fallback: 0, useOr: false };
        if (tokens[cursor] && tokens[cursor].value === '||') {
            if (!tokens[cursor + 1] || tokens[cursor + 1].kind !== 'number') throw mvuTemplateError('Number 默认值必须是有限数字', token.start);
            node.fallback = tokens[cursor + 1].value; node.useOr = true; cursor += 2;
        }
    } else if (token.value === '_' && tokens[cursor + 1] && tokens[cursor + 1].value === '.') {
        var method = tokens[cursor + 2] && tokens[cursor + 2].value;
        if (['get', 'cloneDeep'].indexOf(method) < 0 || !tokens[cursor + 3] || tokens[cursor + 3].value !== '(') throw mvuTemplateError('只支持固定 _.get/_.cloneDeep 模式', token.start);
        cursor += 4;
        var root = mvuReadTemplateExpression(tokens, cursor, depth + 1); cursor = root.next;
        if (method === 'cloneDeep') node = root.node;
        else {
            if (!tokens[cursor] || tokens[cursor++].value !== ',' || !tokens[cursor] || tokens[cursor].kind !== 'string' || !parseMvuPath(tokens[cursor].value)) throw mvuTemplateError('_.get 需要安全字面量路径', token.start);
            node = { type: 'property', root: root.node, path: tokens[cursor++].value };
            if (tokens[cursor] && tokens[cursor].value === ',') {
                var fallback = mvuReadLiteralTokens(tokens, cursor + 1, depth + 1);
                if (fallback.value !== null && typeof fallback.value === 'object') throw mvuTemplateError('_.get 默认值必须是标量', token.start);
                node.fallback = fallback.value; cursor = fallback.next;
            }
        }
        if (!tokens[cursor] || tokens[cursor++].value !== ')') throw mvuTemplateError('固定 lodash 模式未闭合', token.start);
    } else if (token.kind === 'word' && ['getvar', 'get_message_variable', 'getMessageVar', 'getGlobalVar', 'getLocalVar', 'getwi'].indexOf(token.value) >= 0) {
        var name = token.value;
        if (!tokens[++cursor] || tokens[cursor++].value !== '(') throw mvuTemplateError('变量读取需要括号', token.start);
        if (name === 'getwi') {
            var first = tokens[cursor++];
            if (!first) throw mvuTemplateError('getwi 需要字面量名称', token.start);
            if (tokens[cursor] && tokens[cursor].value === ',') {
                if (!(first.kind === 'string' && first.value === '') && first.value !== 'null' && first.value !== 'undefined') throw mvuTemplateError('getwi 只支持空来源和字面量名称', first.start);
                cursor++; first = tokens[cursor++];
            }
            if (!first || first.kind !== 'string' || !first.value) throw mvuTemplateError('getwi 需要非空字面量名称', token.start);
            node = { type: 'worldinfo', name: first.value };
        } else {
            var path = tokens[cursor++];
            if (!path || path.kind !== 'string' || !parseMvuPath(path.value)) throw mvuTemplateError('变量读取需要安全字面量路径', token.start);
            node = { type: 'get', path: path.value };
            if (tokens[cursor] && tokens[cursor].value === ',') {
                cursor++;
                if (!tokens[cursor] || tokens[cursor++].value !== '{') throw mvuTemplateError('getvar 选项只支持 defaults 字符串', token.start);
                var option = tokens[cursor++];
                if (!option || ['default', 'defaults'].indexOf(option.value) < 0 || !tokens[cursor] || tokens[cursor++].value !== ':') throw mvuTemplateError('getvar 选项只支持 defaults 字符串', token.start);
                var defaultValue = tokens[cursor++];
                if (!defaultValue || defaultValue.kind !== 'string' || !tokens[cursor] || tokens[cursor++].value !== '}') throw mvuTemplateError('getvar 默认值必须是字面量字符串', token.start);
                node.fallback = defaultValue.value;
            }
        }
        if (!tokens[cursor] || tokens[cursor++].value !== ')') throw mvuTemplateError('变量读取参数不受支持', token.start);
    } else if (token.kind === 'word' && !mvuUnsafeKey(token.value)) { node = { type: 'local', name: token.value }; cursor++; }
    else throw mvuTemplateError('模板表达式不受支持', token.start);
    var properties = [];
    while (tokens[cursor] && (tokens[cursor].value === '.' || tokens[cursor].value === '[')) {
        var key;
        if (tokens[cursor++].value === '.') {
            if (!tokens[cursor] || tokens[cursor].kind !== 'word') throw mvuTemplateError('属性名必须是字面量', token.start);
            key = tokens[cursor++].value;
        } else {
            if (!tokens[cursor] || (tokens[cursor].kind !== 'string' && tokens[cursor].kind !== 'number')) throw mvuTemplateError('属性索引必须是字面量', token.start);
            key = tokens[cursor++].value;
            if (!tokens[cursor] || tokens[cursor++].value !== ']') throw mvuTemplateError('属性索引未闭合', token.start);
        }
        properties.push(key);
        if (!parseMvuPath(properties)) throw mvuTemplateError('模板属性路径无效', token.start);
    }
    if (properties.length) node = { type: 'property', root: node, path: properties };
    return { node: node, next: cursor };
}

function mvuReadTemplateCondition(tokens, position) {
    var cursor = position, negate = false;
    if (tokens[cursor] && tokens[cursor].value === '!') { negate = true; cursor++; }
    var left = mvuReadTemplateExpression(tokens, cursor, 0); cursor = left.next;
    if (left.node.type === 'worldinfo') throw mvuTemplateError('条件不支持世界书查询', tokens[position].start);
    var condition = { left: left.node, negate: negate };
    if (tokens[cursor] && ['===', '!==', '==', '!=', '<', '<=', '>', '>='].indexOf(tokens[cursor].value) >= 0) {
        condition.op = tokens[cursor++].value;
        var right = mvuReadLiteralTokens(tokens, cursor, 0);
        if (right.value !== null && typeof right.value === 'object') throw mvuTemplateError('模板条件仅支持标量比较', tokens[cursor].start);
        condition.right = right.value; cursor = right.next;
    }
    return { condition: condition, next: cursor };
}

function mvuUnwrapTemplateIife(tokens) {
    var cursor = 0;
    if (tokens[cursor] && tokens[cursor].value === ';') cursor++;
    if (!tokens[cursor] || tokens[cursor++].value !== '(') return tokens;
    if (tokens[cursor] && tokens[cursor].value === 'async') cursor++;
    if (tokens[cursor] && tokens[cursor].value === 'function') cursor++;
    else {
        if (!tokens[cursor] || tokens[cursor++].value !== '(' || !tokens[cursor] || tokens[cursor++].value !== ')' || !tokens[cursor] || tokens[cursor++].value !== '=>') return tokens;
    }
    if (tokens[cursor] && tokens[cursor].value === '(') { cursor++; if (!tokens[cursor] || tokens[cursor++].value !== ')') return tokens; }
    if (!tokens[cursor] || tokens[cursor++].value !== '{') return tokens;
    var ending = tokens.length;
    if (tokens[ending - 1] && tokens[ending - 1].value === ';') ending--;
    if (!tokens[ending - 1] || tokens[ending - 1].value !== ')' || !tokens[ending - 2] || tokens[ending - 2].value !== '(' || !tokens[ending - 3] || tokens[ending - 3].value !== ')' || !tokens[ending - 4] || tokens[ending - 4].value !== '}') return tokens;
    return tokens.slice(cursor, ending - 4);
}
