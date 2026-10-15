/**
 * Declarative regex_scripts compatibility for character cards and imported presets.
 * Only RegExp replacement is supported; card JavaScript is never evaluated here.
 */
var REGEX_SOURCE_PLACEMENTS = Object.freeze({
    MD_DISPLAY: 0,
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6
});

function isCardRuntimeRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getCharacterRegexScripts(character) {
    var extensions = character && isCardRuntimeRecord(character.extensions) ? character.extensions : {};
    return Array.isArray(extensions.regex_scripts)
        ? extensions.regex_scripts.filter(isCardRuntimeRecord)
        : [];
}

function characterHasRegexScripts(character) {
    return getCharacterRegexScripts(character).length > 0;
}

function normalizeRegexSourcePlacement(value) {
    if (typeof value === 'number' && Object.values(REGEX_SOURCE_PLACEMENTS).includes(value)) return value;
    var normalized = String(value == null ? '' : value).trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (/^\d+$/.test(normalized)) {
        var numeric = Number(normalized);
        return Object.values(REGEX_SOURCE_PLACEMENTS).includes(numeric) ? numeric : null;
    }
    var aliases = {
        DISPLAY: 'MD_DISPLAY',
        MARKDOWN: 'MD_DISPLAY',
        USER: 'USER_INPUT',
        INPUT: 'USER_INPUT',
        ASSISTANT: 'AI_OUTPUT',
        AI: 'AI_OUTPUT',
        OUTPUT: 'AI_OUTPUT',
        SLASH: 'SLASH_COMMAND',
        WORLDINFO: 'WORLD_INFO'
    };
    normalized = aliases[normalized] || normalized;
    return Object.prototype.hasOwnProperty.call(REGEX_SOURCE_PLACEMENTS, normalized)
        ? REGEX_SOURCE_PLACEMENTS[normalized]
        : null;
}

function getRegexScriptPlacements(script) {
    var placement = script && script.placement;
    var values = Array.isArray(placement) ? placement : (placement == null || placement === '' ? [] : [placement]);
    return values.map(normalizeRegexSourcePlacement).filter(function(value) { return value != null; });
}

function regexScriptHasPlacement(script, sourcePlacement) {
    var target = normalizeRegexSourcePlacement(sourcePlacement);
    return target != null && getRegexScriptPlacements(script).includes(target);
}

function regexScriptMatchesProcessingPhase(script, processingPhase) {
    var phase = String(processingPhase || '').toLowerCase();
    if (phase !== 'display' && phase !== 'prompt') return false;
    var markdownOnly = script && script.markdownOnly === true;
    var promptOnly = script && script.promptOnly === true;
    if (!markdownOnly && !promptOnly) return true;
    return phase === 'display' ? markdownOnly : promptOnly;
}

function getRegexScriptFindSource(script) {
    if (!isCardRuntimeRecord(script)) return '';
    if (script.findRegex != null && String(script.findRegex) !== '') return String(script.findRegex);
    if (script.regex != null && String(script.regex) !== '') return String(script.regex);
    if (script.find != null && String(script.find) !== '') return String(script.find);
    return '';
}

function getRegexScriptReplacement(script) {
    if (!isCardRuntimeRecord(script)) return '';
    if (script.replaceString != null) return String(script.replaceString);
    if (script.replacement != null) return String(script.replacement);
    if (script.replace != null) return String(script.replace);
    return '';
}

function buildRegexScriptPattern(findRegex, flagsHint) {
    var source = String(findRegex || '');
    if (!source || source.length > 10000) return null;
    var flags = 'g';
    var slashPattern = source.match(/^\/(.*)\/([a-z]*)$/s);
    if (slashPattern) {
        source = slashPattern[1];
        flags = slashPattern[2] || 'g';
    } else if (flagsHint != null && String(flagsHint).trim()) {
        flags = String(flagsHint).trim();
    }
    if (!flags.includes('g')) flags += 'g';
    try {
        return new RegExp(source, flags);
    } catch (error) {
        console.warn('[Regex] Invalid character-card expression skipped:', error && error.message);
        return null;
    }
}

function regexScriptNumericBound(value) {
    if (value == null || value === '') return NaN;
    var number = Number(value);
    return Number.isFinite(number) ? number : NaN;
}

function regexScriptMatchesDepth(script, depth) {
    var current = Number(depth);
    if (!Number.isFinite(current)) return true;
    var minimum = regexScriptNumericBound(script.minDepth);
    var maximum = regexScriptNumericBound(script.maxDepth);
    if (Number.isFinite(minimum) && current < minimum) return false;
    if (Number.isFinite(maximum) && current > maximum) return false;
    return true;
}

function expandRegexReplacement(template, args) {
    return String(template || '').replace(/\$(\$|&|\d{1,2})/g, function(token, key) {
        if (key === '$') return '$';
        if (key === '&') return args[0] == null ? '' : String(args[0]);
        var index = parseInt(key, 10);
        return Number.isFinite(index) && args[index] != null ? String(args[index]) : token;
    });
}

function getRegexContextMvuSnapshot(context) {
    context = context || {};
    if (context.historySnapshot != null) return context.historySnapshot;
    if (context.mvuData != null) return context.mvuData;
    return context.conv && typeof getMvuDataForMessage === 'function'
        ? getMvuDataForMessage(context.conv, context.message || context.msg || null)
        : null;
}

function buildRegexReplacementContext(context, original) {
    context = context || {};
    var message = context.message || context.msg || null;
    return {
        conv: context.conv,
        message: message,
        sourceMessage: context.sourceMessage || message,
        sourceId: context.sourceId,
        sourceRevision: context.sourceRevision,
        historySnapshot: context.historySnapshot,
        mvuData: getRegexContextMvuSnapshot(context),
        macroEnv: context.macroEnv,
        original: original,
        settings: context.settings || (typeof state !== 'undefined' && state && state.settings ? state.settings : {}),
        processingPhase: context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display'),
        depth: context.depth,
        allowStVarMutations: context.allowStVarMutations === true
    };
}

function buildRegexContextKey(context, replacement) {
    var settings = context.settings || {};
    var preset = settings.sillyTavernPreset || {};
    return JSON.stringify({
        sourceId: context.sourceId == null ? null : String(context.sourceId),
        sourceRevision: context.sourceRevision == null ? null : String(context.sourceRevision),
        snapshot: getRegexContextMvuSnapshot(context),
        processingPhase: context.processingPhase || null,
        depth: context.depth == null ? null : context.depth,
        replacement: String(replacement || ''),
        settings: {
            userName: settings.userName || '',
            userDescription: settings.userDescription || '',
            presetMain: getSillyTavernPresetPromptContentFromSettings(settings, 'main'),
            presetJailbreak: getSillyTavernPresetPromptContentFromSettings(settings, 'jailbreak'),
            globalRegexEnabled: settings.globalRegexEnabled === true,
            presetRegexEnabled: preset.regexScriptsEnabled === true
        }
    });
}

function getEnabledRegexScripts(character, context) {
    context = context || {};
    var phase = context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display');
    var scripts = [];
    var settings = context.settings || (typeof state !== 'undefined' && state && state.settings ? state.settings : {});
    if (settings.globalRegexEnabled === true && Array.isArray(settings.globalRegexScripts)) {
        settings.globalRegexScripts.filter(isCardRuntimeRecord).forEach(function(script) { scripts.push(script); });
    }
    var preset = settings.sillyTavernPreset;
    if (preset && preset.regexScriptsEnabled === true && Array.isArray(preset.regexScripts)) {
        preset.regexScripts.filter(isCardRuntimeRecord).forEach(function(script) { scripts.push(script); });
    }
    if (characterHasRegexScripts(character)) {
        var enabled = phase === 'prompt'
            ? character.regexScriptsPromptEnabled === true
            : character.regexScriptsEnabled === true;
        if (enabled) getCharacterRegexScripts(character).forEach(function(script) { scripts.push(script); });
    }
    return scripts;
}

function regexScriptIsActiveForContext(script, sourcePlacement, phase, context) {
    if (!isCardRuntimeRecord(script) || script.disabled === true || script.enabled === false) return false;
    if (!regexScriptHasPlacement(script, sourcePlacement)) return false;
    if (!regexScriptMatchesProcessingPhase(script, phase)) return false;
    if (context && context.isEdit === true && script.runOnEdit !== true) return false;
    if (!regexScriptMatchesDepth(script, context && context.depth)) return false;
    return true;
}

function collectRegexDisplaySteps(character, context, sourcePlacement) {
    var steps = [];
    getEnabledRegexScripts(character, context).forEach(function(script) {
        if (!regexScriptIsActiveForContext(script, sourcePlacement, 'display', context)) return;
        var pattern = buildRegexScriptPattern(getRegexScriptFindSource(script), script.flags);
        if (pattern) steps.push({ script: script, pattern: pattern });
    });
    return steps;
}

// 无 Worker 时同步执行显示规则；复杂规则保持原文，留给最终消息渲染处理。
function runRegexDisplayStepsSync(text, context, steps, charName, userName, mvuData) {
    var result = String(text == null ? '' : text);
    steps.forEach(function(step) {
        if (typeof isFixedWidthRegex === 'function' && !isFixedWidthRegex(step.pattern)) return;
        var replacement = replacePlaceholders(getRegexScriptReplacement(step.script), charName, userName, buildRegexReplacementContext(context, result));
        try {
            result = result.replace(step.pattern, function() {
                var args = arguments;
                var rendered = expandRegexReplacement(replacement, args).replace(/\{\{match\}\}/gi, args[0] == null ? '' : String(args[0]));
                if (Array.isArray(step.script.trimStrings)) {
                    step.script.trimStrings.forEach(function(value) {
                        if (value) rendered = rendered.split(String(value)).join('');
                    });
                }
                return rendered;
            });
        } catch (error) {
            console.warn('[Regex] Character-card replacement failed:', error && error.message);
        }
    });
    return result;
}

function applyRegexScriptDisplay(text, character, context, sourcePlacement) {
    var raw = String(text == null ? '' : text);
    var settings = context.settings || (typeof state !== 'undefined' && state && state.settings ? state.settings : {});
    var charName = character && character.name ? character.name : 'Assistant';
    var userName = settings.userName || 'User';
    var steps = collectRegexDisplaySteps(character, context, sourcePlacement);
    var owner = context.msg || context.conv;
    if (!steps.length) {
        if (owner && typeof getRegexDisplayChainState === 'function') {
            var existing = getRegexDisplayChainState(context, sourcePlacement, false);
            if (existing) invalidateRegexDisplayChain(existing);
        }
        return raw;
    }
    // 以消息对象（流式路径退化为会话对象）为链所有者，无 Worker 时退回同步替换。
    if (owner && typeof runRegexDisplayChain === 'function' && typeof Worker !== 'undefined') {
        return runRegexDisplayChain(raw, character, context, steps, sourcePlacement, { charName: charName, userName: userName, settings: settings });
    }
    var mvuData = getRegexContextMvuSnapshot(context);
    return runRegexDisplayStepsSync(raw, context, steps, charName, userName, mvuData);
}

function applyRegexScripts(text, character, context) {
    context = context || {};
    var phase = context.processingPhase || (context.forPrompt === true ? 'prompt' : 'display');
    var sourcePlacement = normalizeRegexSourcePlacement(context.sourcePlacement);
    if (sourcePlacement == null) {
        var role = String(context.messageRole || context.msg && context.msg.role || '').toLowerCase();
        sourcePlacement = role === 'user' ? REGEX_SOURCE_PLACEMENTS.USER_INPUT : REGEX_SOURCE_PLACEMENTS.AI_OUTPUT;
    }
    if (phase === 'display') return applyRegexScriptDisplay(text, character, context, sourcePlacement);
    var settings = typeof state !== 'undefined' && state && state.settings ? state.settings : {};
    var charName = character && character.name ? character.name : 'Assistant';
    var userName = settings.userName || 'User';

    return getEnabledRegexScripts(character, context).reduce(function(result, script) {
        if (!regexScriptIsActiveForContext(script, sourcePlacement, phase, context)) return result;
        var pattern = buildRegexScriptPattern(getRegexScriptFindSource(script), script.flags);
        if (!pattern) return result;
        var replacementContext = buildRegexReplacementContext(context, result);
        var replacement = replacePlaceholders(getRegexScriptReplacement(script), charName, userName, replacementContext);
        if (typeof runRegexReplacement === 'function' && typeof Worker !== 'undefined') {
            var contextKey = buildRegexContextKey(replacementContext, replacement);
            var data = { text: result, source: pattern.source, flags: pattern.flags, replacement: replacement, trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings.map(String) : [], contextKey: contextKey };
            var cached = regexResultCache.get(JSON.stringify(data));
            if (typeof cached === 'string') return cached;
            runRegexReplacement(result, pattern, replacement, script, { priority: 'prompt', contextKey: contextKey }).catch(function(error) { console.warn('[Regex]', error && error.message); });
            return result;
        }
        if (typeof isFixedWidthRegex === 'function' && !isFixedWidthRegex(pattern)) return result;
        try {
            return result.replace(pattern, function() {
                var args = arguments;
                var rendered = expandRegexReplacement(replacement, args)
                    .replace(/\{\{match\}\}/gi, args[0] == null ? '' : String(args[0]));
                if (Array.isArray(script.trimStrings)) {
                    script.trimStrings.forEach(function(value) {
                        if (value) rendered = rendered.split(String(value)).join('');
                    });
                }
                return rendered;
            });
        } catch (error) {
            console.warn('[Regex] Character-card replacement failed:', error && error.message);
            return result;
        }
    }, String(text == null ? '' : text));
}

function getRegexContextCharacter(context) {
    if (context.character) return context.character;
    var conv = context.conv;
    if (!conv) return null;
    if (typeof isGroupChat === 'function' && isGroupChat(conv) && typeof getCurrentSpeakerCharacter === 'function') {
        return getCurrentSpeakerCharacter(conv);
    }
    return conv.character || null;
}

function formatMessage(message, context) {
    context = context || {};
    if (typeof context.isEdit === 'undefined') context.isEdit = !!(context.msg && context.msg.editedAt);
    if (!context.processingPhase) context.processingPhase = context.forPrompt === true ? 'prompt' : 'display';
    if (context.sourcePlacement == null) {
        var role = String(context.messageRole || context.msg && context.msg.role || '').toLowerCase();
        context.sourcePlacement = role === 'user' ? 'USER_INPUT' : 'AI_OUTPUT';
    }
    var formatted = applyRegexScripts(String(message == null ? '' : message), getRegexContextCharacter(context), context);
    return finishFormattedMessage(formatted, context);
}

function finishFormattedMessage(formatted, context) {
    if (context.forPrompt !== true && typeof renderStaticMessage === 'function') {
        return formatted;
    } else if (typeof stripMvuControlBlocks === 'function') {
        formatted = stripMvuControlBlocks(formatted);
    } else {
        formatted = formatted.replace(/<(?:UpdateVariable|JSONPatch|initvar)\b[^>]*>[\s\S]*?<\/(?:UpdateVariable|JSONPatch|initvar)>/gi, '').trim();
    }
    if (context.forPrompt === true) {
        formatted = formatted.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    return formatted;
}

function formatWorldInfoEntriesForPrompt(groups, character, conv) {
    var formatted = {};
    Object.keys(groups || {}).forEach(function(key) {
        formatted[key] = (Array.isArray(groups[key]) ? groups[key] : []).map(function(entry) {
            if (!isCardRuntimeRecord(entry)) return entry;
            var copy = Object.assign({}, entry);
            copy.content = formatMessage(entry.content || '', {
                conv: conv,
                character: character,
                forPrompt: true,
                processingPhase: 'prompt',
                sourcePlacement: 'WORLD_INFO',
                depth: Number.isFinite(Number(entry.depth)) ? Number(entry.depth) : undefined
            });
            return copy;
        });
    });
    return formatted;
}

async function requestCharacterRegexConsent(character, options) {
    if (!characterHasRegexScripts(character) || character.regexScriptsPrompted === true) return character;
    var accepted = await showGlassConfirm(
        '此角色卡包含 regex_scripts，可能修改显示文本或发送给模型的提示词。这里只执行正则替换，不执行脚本。是否启用？',
        { title: '角色卡格式化权限', okText: '启用', cancelText: '保持关闭' }
    );
    character.regexScriptsPrompted = true;
    character.regexScriptsEnabled = accepted === true;
    character.regexScriptsPromptEnabled = accepted === true && (!options || options.enablePrompt !== false);
    return character;
}

async function requestSillyTavernPresetRegexConsent(preset) {
    if (!preset || !Array.isArray(preset.regexScripts) || preset.regexScripts.length === 0 || preset.regexScriptsPrompted === true) {
        return preset;
    }
    var accepted = await showGlassConfirm(
        t('settings_st_preset_regex_consent'),
        {
            title: t('settings_st_preset_regex_title'),
            okText: t('settings_st_preset_regex_enable'),
            cancelText: t('settings_st_preset_regex_keep_disabled')
        }
    );
    preset.regexScriptsPrompted = true;
    preset.regexScriptsEnabled = accepted === true;
    return preset;
}
