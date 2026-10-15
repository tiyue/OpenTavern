/**
 * 消息显示准备：统一普通、流式、最终和卡片静态显示的文本处理。
 * 输入只读；可执行源码和静态显示派生内容分开返回，准备过程不保存、不联网、不运行卡片脚本。
 */
function createMessageDisplayModel(dependencies) {
    var deps = dependencies || {};

    function cloneContext(context) {
        var result = {};
        Object.keys(context || {}).forEach(function(key) { result[key] = context[key]; });
        return result;
    }

    function removeOptionRanges(text, ranges) {
        var result = String(text == null ? '' : text);
        for (var index = ranges.length - 1; index >= 0; index--) {
            var start = ranges[index].start;
            while (start >= 2 && result.slice(start - 2, start) === '\r\n') start -= 2;
            while (start >= 1 && (result.charAt(start - 1) === '\n' || result.charAt(start - 1) === '\r')) start -= 1;
            result = result.slice(0, start) + result.slice(ranges[index].end);
        }
        return result.trim();
    }

    function stripIncompleteSecondStageOptions(text, options) {
        if (!options.length) return String(text == null ? '' : text);
        var source = String(text == null ? '' : text);
        var container = /<options\b[^>]*>/i.exec(source);
        if (!container) return source;
        var optionPattern = /<option\b[^>]*>[\s\S]*?<\/option\s*>/gi;
        optionPattern.lastIndex = container.index + container[0].length;
        var end = -1;
        var match;
        while ((match = optionPattern.exec(source)) !== null) end = match.index + match[0].length;
        if (end < 0) return source;
        return (source.slice(0, container.index) + source.slice(end)).trim();
    }

    function parseDisplayOptions(source, includeCodePayloads) {
        var text = String(source == null ? '' : source);
        if (!/<options\b/i.test(text)) return { options: [], ranges: [] };
        var knownSecondStageContent = includeCodePayloads !== false;
        var mask = knownSecondStageContent ? null : deps.getSecondStageCodeProtectionMask(text);
        var pattern = /<options\b[^>]*>[\s\S]*?<\/options\s*>/gi;
        var ranges = [];
        var options = [];
        var match;
        while ((match = pattern.exec(text)) !== null) {
            var start = match.index;
            var end = start + match[0].length;
            if (!knownSecondStageContent && deps.isSecondStageRangeCodeProtected(mask, start, end)) continue;
            var parsed = deps.parseSecondStageOptions(match[0]) || [];
            if (!parsed.length) continue;
            ranges.push({ start: start, end: end });
            options = options.concat(parsed);
        }
        if (knownSecondStageContent && !options.length) options = deps.parseSecondStageOptions(text) || [];
        return { options: options.slice(0, 4), ranges: ranges };
    }

    function escapeOptionTagsOutsideCode(text) {
        var source = String(text == null ? '' : text);
        var mask = deps.getSecondStageCodeProtectionMask(source);
        return source.replace(/<(\/?)((?:options|option))\b[^>]*>/gi, function(match, _slash, _name, offset) {
            return deps.isSecondStageRangeCodeProtected(mask, offset, offset + match.length) ? match : deps.escapeHtml(match);
        });
    }

    function renderFallbackDisplay(raw) {
        var html = '';
        var lastIndex = 0;
        var statusBlockRe = /<details\b[\s\S]*?<\/details>/gi;
        var match;
        while ((match = statusBlockRe.exec(raw)) !== null) {
            var block = match[0];
            if (block.indexOf('状态栏') === -1 && block.indexOf('狀態欄') === -1) continue;
            html += deps.highlightDialogue(raw.slice(lastIndex, match.index));
            html += deps.sanitizeStatusBarHtml(block);
            lastIndex = match.index + block.length;
        }
        return html + deps.highlightDialogue(raw.slice(lastIndex));
    }

    function prepareOptions(source, includeCodePayloads) {
        return parseDisplayOptions(source, includeCodePayloads).options;
    }

    function prepare(input) {
        input = input || {};
        var rawText = String(input.text == null ? '' : input.text);
        var sourceContext = cloneContext(input.context);
        var role = input.messageRole || sourceContext.messageRole || sourceContext.msg && sourceContext.msg.role || 'assistant';
        var context = cloneContext(sourceContext);
        context.messageRole = role;
        context.processingPhase = 'display';
        context.sourcePlacement = input.sourcePlacement || context.sourcePlacement || (String(role).toLowerCase() === 'user' ? 'USER_INPUT' : 'AI_OUTPUT');
        var stage = input.stage || context.stage || context.msg && context.msg.stage || 'main';
        var secondStageContent = input.secondStageContent === true || stage === 'second';
        context.stage = stage;
        var sourceText = rawText;
        if (input.isolatePrimary === true && !secondStageContent && typeof deps.isolatePrimaryStageContent === 'function') {
            sourceText = deps.isolatePrimaryStageContent(sourceText, input.settings || context.settings);
        }

        var formattedText = sourceText;
        if (input.processMessage !== false && typeof deps.formatMessage === 'function') {
            formattedText = deps.formatMessage(sourceText, context);
        }
        var executableText = formattedText;
        var displaySource = formattedText;
        var diagnostics = [];
        if (input.processMessage !== false && context.conv && context.msg && !secondStageContent && typeof deps.renderDeclarativeTemplateSubset === 'function') {
            var rendered = deps.renderDeclarativeTemplateSubset(formattedText, deps.getMvuDataForMessage(context.conv, context.msg), {
                worldInfo: deps.getMvuWorldInfoEntries(context.conv),
                escapeValues: true
            });
            diagnostics = (rendered.diagnostics || []).concat(deps.getMvuDiagnostics(context.conv, context.msg) || []);
            executableText = deps.stripMvuControlBlocks(rendered.output);
        }

        displaySource = deps.stripDreamControlWrappers(executableText);
        var parsed = parseDisplayOptions(displaySource, secondStageContent);
        var contentText = parsed.options.length
            ? (parsed.ranges.length ? removeOptionRanges(displaySource, parsed.ranges) : stripIncompleteSecondStageOptions(displaySource, parsed.options))
            : displaySource;
        var optionHtml = deps.renderOptionChoices(parsed.options);
        var staticInput = escapeOptionTagsOutsideCode(contentText);
        var contentHtml = typeof deps.renderStaticMessage === 'function'
            ? deps.renderStaticMessage(staticInput)
            : renderFallbackDisplay(contentText);
        if (contentHtml == null) contentHtml = renderFallbackDisplay(contentText);
        if (secondStageContent && optionHtml && !contentText) contentHtml = '';
        var noticeHtml = '';
        if (diagnostics.length) {
            noticeHtml = '<p class="message-content-notice">' + deps.escapeHtml(diagnostics.map(function(item) {
                return typeof item === 'string' ? item : item.message || item.code;
            }).join('；')) + '</p>';
        }
        return {
            inputText: rawText,
            sourceText: sourceText,
            formattedText: formattedText,
            executableText: executableText,
            stage: stage,
            secondStageContent: secondStageContent,
            context: context,
            display: {
                text: contentText,
                html: contentHtml + optionHtml,
                options: parsed.options,
                optionHtml: optionHtml,
                diagnostics: diagnostics
            },
            noticeHtml: noticeHtml
        };
    }

    return {
        prepare: prepare,
        prepareOptions: prepareOptions
    };
}

var messageDisplayModel = createMessageDisplayModel({
    formatMessage: function(text, context) { return typeof formatMessage === 'function' ? formatMessage(text, context) : String(text); },
    isolatePrimaryStageContent: function(text, settings) {
        return typeof isolatePrimaryStageContentWithSettings === 'function'
            ? isolatePrimaryStageContentWithSettings(text, settings)
            : (typeof isolatePrimaryStageContent === 'function' ? isolatePrimaryStageContent(text) : String(text));
    },
    renderDeclarativeTemplateSubset: function() { return typeof renderDeclarativeTemplateSubset === 'function' ? renderDeclarativeTemplateSubset.apply(null, arguments) : { output: arguments[0], diagnostics: [] }; },
    getMvuDataForMessage: function(conv, msg) { return typeof getMvuDataForMessage === 'function' ? getMvuDataForMessage(conv, msg) : {}; },
    getMvuWorldInfoEntries: function(conv) { return typeof getMvuWorldInfoEntries === 'function' ? getMvuWorldInfoEntries(conv) : {}; },
    getMvuDiagnostics: function(conv, msg) { return typeof getMvuDiagnostics === 'function' ? getMvuDiagnostics(conv, msg) : []; },
    stripMvuControlBlocks: function(text) { return typeof stripMvuControlBlocks === 'function' ? stripMvuControlBlocks(text) : String(text); },
    stripDreamControlWrappers: function(text) { return typeof stripDreamControlWrappers === 'function' ? stripDreamControlWrappers(text) : String(text); },
    getSecondStageCodeProtectionMask: function(text) { return typeof getSecondStageCodeProtectionMask === 'function' ? getSecondStageCodeProtectionMask(text) : new Uint8Array(String(text).length); },
    isSecondStageRangeCodeProtected: function(mask, start, end) { return typeof isSecondStageRangeCodeProtected === 'function' && isSecondStageRangeCodeProtected(mask, start, end); },
    parseSecondStageOptions: function(text) { return typeof parseSecondStageOptions === 'function' ? parseSecondStageOptions(text) : []; },
    renderOptionChoices: function(options) { return typeof renderOptionChoices === 'function' ? renderOptionChoices(options) : ''; },
    renderStaticMessage: function(text) { return typeof renderStaticMessage === 'function' ? renderStaticMessage(text) : null; },
    sanitizeStatusBarHtml: function(text) { return typeof sanitizeStatusBarHtml === 'function' ? sanitizeStatusBarHtml(text) : String(text); },
    highlightDialogue: function(text) { return typeof highlightDialogue === 'function' ? highlightDialogue(text) : String(text); },
    escapeHtml: function(text) { return typeof escapeHtml === 'function' ? escapeHtml(text) : String(text); }
});

function prepareMessageDisplay(input) {
    return messageDisplayModel.prepare(input);
}
