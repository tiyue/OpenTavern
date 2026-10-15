
function parseJsonPointer(pointer) {
    if (typeof pointer !== 'string' || pointer[0] !== '/' || pointer.length > 4096 || /~(?:[^01]|$)/.test(pointer)) return null;
    var parts = pointer.slice(1).split('/').map(function(key) { return key.replace(/~1/g, '/').replace(/~0/g, '~'); });
    return parts.length <= MVU_MAX_DEPTH && !parts.some(mvuUnsafeKey) ? parts : null;
}

function mvuPointerParent(root, parts) {
    var current = root;
    for (var i = 0; i < parts.length - 1; i++) {
        var key = parts[i];
        if (Array.isArray(current) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length)) return null;
        if ((!Array.isArray(current) && !mvuIsObject(current)) || !mvuOwn(current, key)) return null;
        current = current[key];
    }
    return Array.isArray(current) || mvuIsObject(current) ? { parent: current, key: parts[parts.length - 1] } : null;
}

function mvuPointerRead(root, parts) {
    var target = mvuPointerParent(root, parts);
    if (!target || (Array.isArray(target.parent) && (!/^(0|[1-9]\d*)$/.test(target.key) || Number(target.key) >= target.parent.length)) || !mvuOwn(target.parent, target.key)) return { found: false };
    return { found: true, value: target.parent[target.key] };
}

function mvuPointerWrite(root, parts, value, replace) {
    var target = mvuPointerParent(root, parts);
    if (!target) return false;
    if (Array.isArray(target.parent)) {
        if (target.key === '-' && !replace) { target.parent.push(value); return true; }
        if (!/^(0|[1-9]\d*)$/.test(target.key)) return false;
        var index = Number(target.key);
        if (index > target.parent.length || (replace && index === target.parent.length)) return false;
        if (replace) target.parent[index] = value; else target.parent.splice(index, 0, value);
    } else {
        if (replace && !mvuOwn(target.parent, target.key)) return false;
        target.parent[target.key] = value;
    }
    return true;
}

function mvuPointerRemove(root, parts) {
    var target = mvuPointerParent(root, parts);
    if (!target || !mvuOwn(target.parent, target.key)) return false;
    if (Array.isArray(target.parent)) {
        if (!/^(0|[1-9]\d*)$/.test(target.key) || Number(target.key) >= target.parent.length) return false;
        target.parent.splice(Number(target.key), 1);
    } else delete target.parent[target.key];
    return true;
}

function isMvuValueWithDescription(value) {
    return Array.isArray(value) && value.length === 2 && typeof value[1] === 'string' && !Array.isArray(value[0]);
}

function isMvuTypeCompatible(previous, next) {
    var current = isMvuValueWithDescription(previous) ? previous[0] : previous;
    if (current == null || next == null) return true;
    if (Array.isArray(current)) return Array.isArray(next);
    if (mvuIsObject(current)) return mvuIsObject(next);
    return typeof current === typeof next;
}

function mvuApplyPatch(data, operation, envelope) {
    if (!mvuIsObject(operation) || typeof operation.op !== 'string') throw mvuSyntaxError('Patch 操作需要 op 字段', 0);
    var op = operation.op.toLowerCase();
    if (op === 'insert') op = 'add';
    if (!/^(add|replace|remove|test|copy|move|delta)$/.test(op)) throw mvuSyntaxError('不支持的 Patch 操作：' + op, 0);
    var pathText = op === 'move' && (operation.path == null || operation.path === '') ? operation.to : operation.path;
    var path = parseJsonPointer(pathText), root = envelope ? data : data.stat_data;
    if (!path) throw mvuSyntaxError('Patch 路径无效', 0);
    var command = { type: 'json-patch', op: op, path: pathText };
    if (['add', 'replace', 'test', 'delta'].indexOf(op) >= 0 && !mvuOwn(operation, 'value')) throw mvuSyntaxError('Patch 缺少 value', 0);
    var value = operation.value, success = false;
    if (op === 'add' || op === 'replace') success = mvuPointerWrite(root, path, JSON.parse(JSON.stringify(value)), op === 'replace');
    else if (op === 'remove') success = mvuPointerRemove(root, path);
    else if (op === 'test') {
        var tested = mvuPointerRead(root, path);
        success = tested.found && JSON.stringify(tested.value) === JSON.stringify(value);
    } else if (op === 'copy' || op === 'move') {
        var from = parseJsonPointer(operation.from);
        if (!from) throw mvuSyntaxError('Patch from 路径无效', 0);
        if (op === 'move' && path.length > from.length && from.every(function(key, index) { return path[index] === key; })) throw mvuSyntaxError('不能将属性移入自身子路径', 0);
        var copied = mvuPointerRead(root, from);
        if (copied.found) { value = JSON.parse(JSON.stringify(copied.value)); success = (op !== 'move' || mvuPointerRemove(root, from)) && mvuPointerWrite(root, path, value, false); }
        command.from = operation.from;
    } else {
        var existing = mvuPointerRead(root, path), described = existing.found && isMvuValueWithDescription(existing.value);
        var previous = described ? existing.value[0] : existing.value;
        if (existing.found && typeof previous === 'number' && Number.isFinite(previous) && typeof value === 'number' && Number.isFinite(value) && Number.isFinite(previous + value)) {
            command.previous = previous; command.delta = value; value = previous + value;
            success = mvuPointerWrite(root, path, described ? [value, existing.value[1]] : value, true);
        }
    }
    if (!success) throw mvuSyntaxError('Patch 操作被拒绝：' + op + ' ' + pathText, 0);
    if (mvuOwn(operation, 'value')) command.value = value;
    if (op === 'add' || op === 'replace' || op === 'delta') {
        var displayPath = envelope ? (path[0] === 'stat_data' ? path.slice(1) : null) : path;
        if (displayPath && displayPath.length) {
            var parent = data.stat_data;
            displayPath = displayPath.map(function(key) {
                var mapped = Array.isArray(parent) ? (key === '-' ? parent.length - 1 : Number(key)) : key;
                parent = parent && parent[mapped];
                return mapped;
            });
            var display = op === 'delta' ? String(command.previous) + '->' + String(value) : value;
            if (!setMvuPathValue(data.display_data, displayPath, display)) throw mvuSyntaxError('变更显示路径无效', 0);
        }
    }
    return command;
}

function applyMvuContent(base, content) {
    var checked = validateMvuData(base == null ? createEmptyMvuData() : base);
    if (!checked.valid) return { data: createEmptyMvuData(), commands: [], diagnostics: checked.diagnostics };
    var data = checked.data, commands = [], source = String(content || '');
    if (mvuUtf8Length(source) > MVU_MAX_DATA_BYTES) return { data: data, commands: [], diagnostics: [mvuDiagnostic('mvu-content-limit', '消息更新文本超过 1 MiB UTF-8 上限', 0)] };
    var collected = mvuCollectControlBlocks(source), diagnostics = collected.diagnostics;
    function applyBlock(block) {
        var candidate = normalizeMvuData(data), applied = [], operationIndex = 0;
        try {
            if (block.type === 'initvar') {
                var parsed = parseMvuStructuredTextWithDiagnostics(block.content);
                if (!parsed.supported) throw parsed.diagnostics[0];
                if (!mvuIsObject(parsed.value)) throw mvuSyntaxError('InitVar 必须是对象', 0);
                deepMergeMvuObject(candidate.stat_data, mvuIsObject(parsed.value.stat_data) ? parsed.value.stat_data : parsed.value);
                if (mvuIsObject(parsed.value.schema)) deepMergeMvuObject(candidate.schema, parsed.value.schema);
                candidate.display_data = JSON.parse(JSON.stringify(candidate.stat_data));
            } else {
                var update = mvuParseUpdateBlock(block.content);
                var envelope = update.patches.some(function(operation) {
                    var parts = parseJsonPointer(operation && (operation.path || operation.to));
                    return parts && ['stat_data', 'display_data', 'schema', 'initialized_lorebooks'].indexOf(parts[0]) >= 0;
                });
                update.patches.forEach(function(operation, index) {
                    operationIndex = index;
                    var safeOperation = mvuValidateJsonValue(operation);
                    if (!safeOperation.valid) throw safeOperation.diagnostics[0];
                    applied.push(mvuApplyPatch(candidate, safeOperation.data, envelope));
                    if (mvuUtf8Length(JSON.stringify(candidate)) > MVU_MAX_DATA_BYTES) throw mvuDiagnostic('mvu-data-limit', '更新后状态超过 1 MiB UTF-8 上限', 0);
                });
                update.sets.forEach(function(operation, index) {
                    operationIndex = update.patches.length + index;
                    var existing = getMvuPathValue(candidate.stat_data, operation.path);
                    if (!isMvuTypeCompatible(existing, operation.newValue)) throw mvuSyntaxError('set 新值与已有值类型不兼容：' + operation.path, 0);
                    var path = parseMvuPath(operation.path), stored = isMvuValueWithDescription(existing) && typeof path[path.length - 1] !== 'number' ? [operation.newValue, existing[1]] : operation.newValue;
                    if (!setMvuPathValue(candidate.stat_data, path, stored)) throw mvuSyntaxError('set 路径无效：' + operation.path, 0);
                    var display = String(operation.oldValue == null ? '' : operation.oldValue) + '->' + String(operation.newValue == null ? '' : operation.newValue) + (operation.reason ? '(' + operation.reason + ')' : '');
                    if (!setMvuPathValue(candidate.display_data, path, display)) throw mvuSyntaxError('set 显示路径无效', 0);
                    applied.push(operation);
                    if (mvuUtf8Length(JSON.stringify(candidate)) > MVU_MAX_DATA_BYTES) throw mvuDiagnostic('mvu-data-limit', '更新后状态超过 1 MiB UTF-8 上限', 0);
                });
            }
            var validated = validateMvuData(candidate);
            if (!validated.valid) throw validated.diagnostics[0];
            data = validated.data;
            applied.forEach(function(command) { command.blockIndex = block.index; command.blockEnd = block.end; });
            commands = commands.concat(applied);
        } catch (error) {
            var diagnostic = error && error.code ? Object.assign({}, error) : mvuSyntaxError('更新块无法应用', 0);
            diagnostic.offset = block.index + (Number(diagnostic.offset) || 0); diagnostic.blockIndex = block.index; diagnostic.operationIndex = operationIndex;
            diagnostics.push(diagnostic);
        }
    }
    collected.blocks.filter(function(block) { return block.type === 'initvar'; }).forEach(applyBlock);
    collected.blocks.filter(function(block) { return block.type !== 'initvar'; }).forEach(applyBlock);
    return { data: data, commands: commands, diagnostics: diagnostics };
}
