// MVU accepts bounded JSON data only; all reads return owned data or scalar values.
var MVU_MAX_DATA_BYTES = 1024 * 1024;
var MVU_MAX_DEPTH = 32;
var MVU_MAX_NODES = 100000;
var MVU_MAX_OPERATIONS = 256;

function mvuDiagnostic(code, message, offset) {
    var diagnostic = { level: 'unsupported', code: code, message: message };
    if (Number.isInteger(offset)) diagnostic.offset = offset;
    return diagnostic;
}

function mvuIsObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function mvuUnsafeKey(key) {
    return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

function mvuOwn(object, key) {
    return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function mvuUtf8Length(text) {
    var source = String(text);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(source).length;
    var bytes = 0;
    for (var i = 0; i < source.length; i++) {
        var code = source.charCodeAt(i);
        if (code < 128) bytes++;
        else if (code < 2048) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < source.length && source.charCodeAt(i + 1) >= 0xdc00 && source.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
        else bytes += 3;
    }
    return bytes;
}

function mvuValidateJsonValue(value) {
    var diagnostics = [], ancestors = new Set(), nodes = 0, estimatedBytes = 0;
    function reject(code, message) { throw mvuDiagnostic(code, message); }
    function visit(current, depth) {
        if (++nodes > MVU_MAX_NODES || depth > MVU_MAX_DEPTH) reject('mvu-data-depth', '变量数据超过节点或 32 层深度上限');
        if (current === null || typeof current === 'boolean') return current;
        if (typeof current === 'number') {
            if (!Number.isFinite(current)) reject('mvu-number-invalid', '变量只允许有限数字');
            return current;
        }
        if (typeof current === 'string') {
            estimatedBytes += mvuUtf8Length(current);
            if (estimatedBytes > MVU_MAX_DATA_BYTES) reject('mvu-data-limit', '变量数据超过 1 MiB UTF-8 上限');
            return current;
        }
        if (!Array.isArray(current) && !mvuIsObject(current)) reject('mvu-data-type', '变量只允许 JSON 值');
        if (ancestors.has(current)) reject('mvu-data-cycle', '变量数据不能包含循环引用');
        ancestors.add(current);
        var output;
        if (Array.isArray(current)) {
            if (current.length > MVU_MAX_NODES) reject('mvu-data-limit', '变量数组过长');
            output = [];
            for (var i = 0; i < current.length; i++) {
                var descriptor = Object.getOwnPropertyDescriptor(current, String(i));
                if (!descriptor || !mvuOwn(descriptor, 'value')) reject('mvu-data-type', '变量数组不能包含空项或访问器');
                output.push(visit(descriptor.value, depth + 1));
            }
            if (Object.keys(current).some(function(key) { return !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length; })) reject('mvu-data-type', '变量数组不能包含额外属性');
        } else {
            output = {};
            Object.keys(current).forEach(function(key) {
                if (mvuUnsafeKey(key)) reject('mvu-path-unsafe', '变量包含禁止的属性名：' + key);
                var descriptor = Object.getOwnPropertyDescriptor(current, key);
                if (!descriptor || !mvuOwn(descriptor, 'value')) reject('mvu-data-type', '变量对象不能包含访问器');
                estimatedBytes += mvuUtf8Length(key);
                if (estimatedBytes > MVU_MAX_DATA_BYTES) reject('mvu-data-limit', '变量数据超过 1 MiB UTF-8 上限');
                output[key] = visit(descriptor.value, depth + 1);
            });
        }
        ancestors.delete(current);
        return output;
    }
    try {
        var data = visit(value, 0);
        if (mvuUtf8Length(JSON.stringify(data)) > MVU_MAX_DATA_BYTES) throw mvuDiagnostic('mvu-data-limit', '变量数据超过 1 MiB UTF-8 上限');
        return { valid: true, data: data, diagnostics: [] };
    } catch (error) {
        diagnostics.push(error && error.code ? error : mvuDiagnostic('mvu-data-invalid', '变量数据无法读取'));
        return { valid: false, data: null, diagnostics: diagnostics };
    }
}

function createEmptyMvuData() {
    return { stat_data: {}, display_data: {}, schema: {}, initialized_lorebooks: {} };
}

function validateMvuData(value) {
    if (!mvuIsObject(value)) return { valid: false, data: null, diagnostics: [mvuDiagnostic('mvu-envelope-invalid', '变量状态必须是对象')] };
    var result = mvuValidateJsonValue(value);
    if (!result.valid) return result;
    var data = result.data;
    var fields = ['stat_data', 'display_data', 'schema', 'initialized_lorebooks'];
    for (var i = 0; i < fields.length; i++) {
        var key = fields[i];
        if (mvuOwn(data, key) && !mvuIsObject(data[key])) return { valid: false, data: null, diagnostics: [mvuDiagnostic('mvu-envelope-invalid', key + ' 必须是对象')] };
    }
    if (!mvuOwn(data, 'stat_data')) data.stat_data = {};
    if (!mvuOwn(data, 'display_data')) data.display_data = JSON.parse(JSON.stringify(data.stat_data));
    if (!mvuOwn(data, 'schema')) data.schema = {};
    if (!mvuOwn(data, 'initialized_lorebooks')) data.initialized_lorebooks = {};
    if (mvuUtf8Length(JSON.stringify(data)) > MVU_MAX_DATA_BYTES) return { valid: false, data: null, diagnostics: [mvuDiagnostic('mvu-data-limit', '变量数据超过 1 MiB UTF-8 上限')] };
    return { valid: true, data: data, diagnostics: [] };
}

function normalizeMvuData(value) {
    var result = validateMvuData(value);
    return result.valid ? result.data : createEmptyMvuData();
}

function deepMergeMvuObject(target, source) {
    var checked = mvuValidateJsonValue(source);
    if (!mvuIsObject(target) || !checked.valid || !mvuIsObject(checked.data)) return target;
    function merge(destination, incoming) {
        Object.keys(incoming).forEach(function(key) {
            if (mvuIsObject(incoming[key])) {
                if (!mvuOwn(destination, key) || !mvuIsObject(destination[key])) destination[key] = {};
                merge(destination[key], incoming[key]);
            } else destination[key] = incoming[key];
        });
    }
    merge(target, checked.data);
    return target;
}

function parseMvuPath(path) {
    if (Array.isArray(path)) {
        if (!path.length || path.length > MVU_MAX_DEPTH) return null;
        return path.every(function(key) { return (typeof key === 'string' && !mvuUnsafeKey(key)) || (Number.isInteger(key) && key >= 0 && key < MVU_MAX_NODES); }) ? path.slice() : null;
    }
    if (typeof path !== 'string' || !path.length || path.length > 4096) return null;
    var parts = [], index = 0;
    while (index < path.length) {
        var key;
        if (path[index] === '[') {
            var bracket = path.slice(index).match(/^\[(?:(0|[1-9]\d*)|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\]/);
            if (!bracket) return null;
            try { key = bracket[1] != null ? Number(bracket[1]) : (bracket[2] != null ? JSON.parse('"' + bracket[2] + '"') : bracket[3].replace(/\\(['\\])/g, '$1')); } catch (_) { return null; }
            index += bracket[0].length;
        } else {
            var name = path.slice(index).match(/^[^\s.\[\]"'()]+/);
            if (!name) return null;
            key = name[0];
            index += name[0].length;
        }
        if (mvuUnsafeKey(key) || (typeof key === 'number' && key >= MVU_MAX_NODES)) return null;
        parts.push(key);
        if (parts.length > MVU_MAX_DEPTH) return null;
        if (index === path.length) break;
        if (path[index] === '.') { index++; if (index === path.length || path[index] === '[') return null; }
        else if (path[index] !== '[') return null;
    }
    return parts;
}

function getMvuPathValue(root, path) {
    var parts = parseMvuPath(path);
    if (!parts) return undefined;
    var current = root;
    for (var i = 0; i < parts.length; i++) {
        if ((!Array.isArray(current) && !mvuIsObject(current)) || !mvuOwn(current, parts[i])) return undefined;
        var descriptor = Object.getOwnPropertyDescriptor(current, parts[i]);
        if (!descriptor || !mvuOwn(descriptor, 'value')) return undefined;
        current = descriptor.value;
    }
    return current;
}

function setMvuPathValue(root, path, value) {
    var parts = parseMvuPath(path);
    if (!parts || (!mvuIsObject(root) && !Array.isArray(root))) return false;
    var current = root, padding = 0;
    function prepareArray(array, key) {
        if (!/^(0|[1-9]\d*)$/.test(String(key)) || Number(key) >= MVU_MAX_NODES) return false;
        var index = Number(key);
        if (padding + Math.max(0, index - array.length) > MVU_MAX_NODES) return false;
        while (array.length < index) { array.push(null); padding++; }
        return true;
    }
    for (var i = 0; i < parts.length - 1; i++) {
        var key = parts[i];
        if (Array.isArray(current) && !prepareArray(current, key)) return false;
        if (!mvuOwn(current, key) || (!mvuIsObject(current[key]) && !Array.isArray(current[key]))) current[key] = typeof parts[i + 1] === 'number' ? [] : {};
        current = current[key];
    }
    var last = parts[parts.length - 1];
    if (Array.isArray(current) && !prepareArray(current, last)) return false;
    current[last] = JSON.parse(JSON.stringify(value));
    return true;
}

function getMvuEntryLabel(entry) {
    return String(entry && (entry.comment || entry.name || entry.title || entry.key || entry.keys) || '');
}

function isMvuInitVarEntry(entry) {
    return !!(entry && (/\[\s*initvar\s*\]|\binitvar\b/i.test(getMvuEntryLabel(entry)) || /<initvar\b/i.test(String(entry.content || ''))));
}
