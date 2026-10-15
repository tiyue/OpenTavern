/**
 * SillyTavern-compatible text macros used by character cards and prompt presets.
 * Unknown macros remain untouched so importing a newer card never destroys data.
 */
var ST_MACRO_MAX_TEXT = 500000;
var ST_MACRO_MAX_DEPTH = 8;
var ST_MACRO_MAX_STEPS = 20000;
var _activeSillyTavernMacroEnv = null;
var _activeSillyTavernMacroMutations = false;

function cloneSillyTavernMacroVars(vars) {
    var source = vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : {};
    var clone = {};
    Object.keys(source).forEach(function(key) {
        var value = source[key];
        if (value && typeof value === 'object') {
            try { value = JSON.parse(JSON.stringify(value)); } catch (_) {}
        }
        clone[key] = value;
    });
    return clone;
}

function sillyTavernMacroVarsEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' && typeof right !== 'object') return false;
    try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
}

function getSillyTavernPresetPromptContent(identifier) {
    var settings = typeof state !== 'undefined' && state && state.settings ? state.settings : {};
    var preset = settings.sillyTavernPreset;
    var prompts = preset && Array.isArray(preset.prompts) ? preset.prompts : [];
    var wanted = String(identifier || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    for (var i = 0; i < prompts.length; i++) {
        var prompt = prompts[i] || {};
        var id = String(prompt.identifier || prompt.id || prompt.name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (id === wanted) return String(prompt.content || '');
    }
    return '';
}

function hashSillyTavernPickSeed(text) {
    var value = String(text || '');
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSillyTavernMacroEnv(conv, extras) {
    extras = extras || {};
    var stored = conv && conv.stLocalVars && typeof conv.stLocalVars === 'object' && !Array.isArray(conv.stLocalVars)
        ? conv.stLocalVars
        : {};
    var vars = cloneSillyTavernMacroVars(stored);
    var history = extras.historyMessages || extras.history || (conv && conv.messages) || [];
    var lastUser = '';
    var lastAssistant = '';
    var lastMessage = '';
    history.forEach(function(message) {
        if (!message || !message.content) return;
        var content = String(message.content);
        lastMessage = content;
        var role = String(message.role || '').toLowerCase();
        if (role === 'user') lastUser = content;
        if (role === 'assistant') lastAssistant = content;
    });
    var settings = typeof state !== 'undefined' && state && state.settings ? state.settings : {};
    var persona = extras.persona == null ? settings.userDescription : extras.persona;
    return {
        vars: vars,
        conv: conv || null,
        mvuData: extras.mvuData || (conv && typeof getMvuDataForMessage === 'function' ? getMvuDataForMessage(conv, extras.message || null) : null),
        charName: String(extras.charName || ''),
        userName: String(extras.userName || settings.userName || 'User'),
        persona: String(persona || ''),
        original: String(extras.original || ''),
        lastUserMessage: lastUser,
        lastCharMessage: lastAssistant,
        lastMessage: lastMessage,
        pickSalt: String((conv && conv.id) || extras.pickSalt || 'chat') + ':pick',
        pickCounter: 0,
        baseVars: cloneSillyTavernMacroVars(vars),
        persistCheck: extras.persistCheck || null,
        persist: extras.persist !== false
    };
}

function persistSillyTavernMacroEnv(env) {
    if (!env || env.persist === false || !env.conv) return false;
    if (typeof env.persistCheck === 'function' && !env.persistCheck()) return false;
    var current = env.conv.stLocalVars && typeof env.conv.stLocalVars === 'object' && !Array.isArray(env.conv.stLocalVars)
        ? env.conv.stLocalVars
        : {};
    var changed = {};
    var hasChanges = false;
    var hasConflict = false;
    var names = Object.keys(Object.assign({}, env.baseVars || {}, env.vars || {}));
    names.forEach(function(name) {
        if (sillyTavernMacroVarsEqual(env.vars[name], env.baseVars[name])) return;
        hasChanges = true;
        if (!sillyTavernMacroVarsEqual(current[name], env.baseVars[name])) hasConflict = true;
        else changed[name] = env.vars[name];
    });
    if (!hasChanges) return true;
    if (hasConflict) return false;
    env.conv.stLocalVars = Object.assign({}, current, changed);
    env.baseVars = cloneSillyTavernMacroVars(env.vars);
    return true;
}

function activateSillyTavernMacroEnv(env, allowMutations) {
    var previous = { env: _activeSillyTavernMacroEnv, mutations: _activeSillyTavernMacroMutations };
    _activeSillyTavernMacroEnv = env || null;
    _activeSillyTavernMacroMutations = allowMutations === true;
    return previous;
}

function restoreSillyTavernMacroEnv(previous) {
    _activeSillyTavernMacroEnv = previous ? previous.env : null;
    _activeSillyTavernMacroMutations = previous ? previous.mutations === true : false;
}

function findSillyTavernMacroClose(text, openIndex) {
    var depth = 0;
    for (var i = openIndex; i < text.length - 1; i++) {
        var pair = text.slice(i, i + 2);
        if (pair === '{{') {
            depth++;
            i++;
        } else if (pair === '}}') {
            depth--;
            if (depth === 0) return i;
            i++;
        }
    }
    return -1;
}

function parseSillyTavernMacroBody(body) {
    var normalized = String(body || '').trim();
    if (!normalized) return { name: '', rest: '' };
    if (normalized.indexOf('//') === 0) return { name: '//', rest: normalized.slice(2) };
    normalized = normalized.replace(/^[\/#!?~>]+/, '').trim();
    var separator = normalized.indexOf('::');
    var head = separator === -1 ? normalized : normalized.slice(0, separator).trim();
    var rest = separator === -1 ? '' : normalized.slice(separator + 2);
    var spaced = head.match(/^([A-Za-z_][\w-]*)\s+([\s\S]+)$/);
    if (spaced) {
        head = spaced[1];
        rest = rest ? spaced[2] + '::' + rest : spaced[2];
    }
    return { name: String(head || '').toLowerCase(), rest: rest };
}

function splitSillyTavernMacroArgs(rest) {
    return String(rest == null ? '' : rest).split('::').map(function(part) { return part.trim(); });
}

function splitSillyTavernRandomOptions(rest) {
    var options = splitSillyTavernMacroArgs(rest).filter(Boolean);
    if (options.length === 1 && options[0].includes(',')) {
        return options[0].split(',').map(function(part) { return part.trim(); }).filter(Boolean);
    }
    return options;
}

function coerceSillyTavernVarNumber(value) {
    if (value == null || value === '') return 0;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function serializeSillyTavernVar(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try { return JSON.stringify(value); } catch (_) { return ''; }
}

function lookupSillyTavernGetvar(name, env) {
    var key = String(name || '');
    if (env && Object.prototype.hasOwnProperty.call(env.vars || {}, key)) {
        return serializeSillyTavernVar(env.vars[key]);
    }
    if (env && env.conv && typeof getMvuDataForMessage === 'function' && typeof getMvuPathValue === 'function') {
        try {
            var data = env.mvuData || getMvuDataForMessage(env.conv, null);
            var value = getMvuPathValue(data, key);
            if (typeof value === 'undefined') value = getMvuPathValue(data.stat_data, key);
            if (typeof value !== 'undefined') return serializeSillyTavernVar(value);
        } catch (_) {}
    }
    return '';
}

function resolveSillyTavernMacro(body, env, options) {
    env = env || createSillyTavernMacroEnv(null, {});
    options = options || {};
    var mutate = options.mutate !== false;
    var parsed = parseSillyTavernMacroBody(body);
    var name = parsed.name;
    var rest = parsed.rest;
    var args = splitSillyTavernMacroArgs(rest);

    if (name === '//' || name === 'comment') return '';
    if (name === 'char') return env.charName || '';
    if (name === 'user') return env.userName || 'User';
    if (name === 'persona') return env.persona || '';
    if (name === 'original') return env.original || '';
    if (name === 'newline') {
        var count = parseInt(args[0], 10);
        if (!Number.isFinite(count) || count < 1) count = 1;
        return new Array(Math.min(count, 32) + 1).join('\n');
    }
    if (name === 'noop' || name === 'trim') return '';
    if (name === 'charprompt') return getSillyTavernPresetPromptContent('main');
    if (name === 'charjailbreak' || name === 'charinstruction') return getSillyTavernPresetPromptContent('jailbreak');
    if (name === 'lastusermessage') return env.lastUserMessage || '';
    if (name === 'lastcharmessage') return env.lastCharMessage || '';
    if (name === 'lastmessage') return env.lastMessage || '';
    if (name === 'getvar') return lookupSillyTavernGetvar(args[0] || rest, env);
    if (name === 'setvar') {
        var setName = args[0] || '';
        if (mutate && setName) env.vars[setName] = args.length > 1 ? args.slice(1).join('::') : '';
        return '';
    }
    if (name === 'addvar') {
        var addName = args[0] || '';
        var delta = args.length > 1 ? args.slice(1).join('::') : '';
        if (mutate && addName) {
            var left = coerceSillyTavernVarNumber(env.vars[addName]);
            var right = coerceSillyTavernVarNumber(delta);
            env.vars[addName] = left != null && right != null
                ? left + right
                : serializeSillyTavernVar(env.vars[addName]) + delta;
        }
        return '';
    }
    if (name === 'incvar' || name === 'decvar') {
        var stepName = args[0] || rest;
        var base = coerceSillyTavernVarNumber(env.vars[stepName]);
        if (base == null) base = 0;
        var next = base + (name === 'incvar' ? 1 : -1);
        if (mutate && stepName) env.vars[stepName] = next;
        return String(next);
    }
    if (name === 'random' || name === 'pick') {
        var choices = splitSillyTavernRandomOptions(rest);
        if (!choices.length) return '';
        if (name === 'random') return choices[Math.floor(Math.random() * choices.length)];
        env.pickCounter++;
        var seed = hashSillyTavernPickSeed(env.pickSalt + ':' + env.pickCounter + ':' + choices.join('\0'));
        return choices[seed % choices.length];
    }
    return '{{' + String(body || '').trim() + '}}';
}

function evaluateSillyTavernMacros(text, env, options, depth) {
    var source = String(text == null ? '' : text);
    if (!source || source.length > ST_MACRO_MAX_TEXT) return source;
    depth = depth || 0;
    if (depth > ST_MACRO_MAX_DEPTH) return source;
    env = env || createSillyTavernMacroEnv(null, {});
    options = options || {};
    var result = '';
    var cursor = 0;
    var steps = 0;
    while (cursor < source.length) {
        if (++steps > ST_MACRO_MAX_STEPS) return result + source.slice(cursor);
        var open = source.indexOf('{{', cursor);
        if (open === -1) return result + source.slice(cursor);
        result += source.slice(cursor, open);
        var close = findSillyTavernMacroClose(source, open);
        if (close === -1) return result + source.slice(open);
        var inner = source.slice(open + 2, close);
        if (inner.includes('{{')) inner = evaluateSillyTavernMacros(inner, env, options, depth + 1);
        result += resolveSillyTavernMacro(inner, env, options);
        cursor = close + 2;
    }
    return result;
}

function applySillyTavernPromptMacros(text, env, options) {
    options = options || {};
    env = env || createSillyTavernMacroEnv(null, {});
    return evaluateSillyTavernMacros(text, env, { mutate: options.mutate !== false });
}
