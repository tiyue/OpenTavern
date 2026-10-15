/**
 * 新手导读（文件：41-second-stage-content-isolation.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“第二阶段、内容、隔离”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `stripSecondStageOptionBlocks(content)`、`isolatePrimaryStageContent(content)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// ==================== Second Stage Content Isolation ====================
// 代码边界与静态消息显示保持同一套规则：围栏按字符和长度关闭，行内代码按等长反引号配对。
function findInlineCodeCloser(text, from, length) {
    var index = from;
    while (index < text.length) {
        var tick = text.indexOf('`', index);
        if (tick === -1) return -1;
        var end = tick;
        while (end < text.length && text.charAt(end) === '`') end += 1;
        if (end - tick === length) return tick;
        index = end;
    }
    return -1;
}

function getMarkdownCodeFenceMarker(line, opening) {
    var match = line.match(opening ? /^ {0,3}(`{3,}|~{3,})(.*)$/ : /^ {0,3}(`{3,}|~{3,})[ \t]*$/);
    if (!match) return null;
    if (opening && match[1].charAt(0) === '`' && match[2].indexOf('`') !== -1) return null;
    return match[1];
}

function getSecondStageCodeProtectionMask(text) {
    var source = String(text == null ? '' : text);
    var protectedMask = new Uint8Array(source.length);
    function protect(start, end) {
        for (var index = Math.max(0, start); index < Math.min(source.length, end); index++) protectedMask[index] = 1;
    }
    function protectInline(start, end) {
        var segment = source.slice(start, end);
        var index = 0;
        while (index < segment.length) {
            var tick = segment.indexOf('`', index);
            if (tick === -1) return;
            var runEnd = tick;
            while (runEnd < segment.length && segment.charAt(runEnd) === '`') runEnd += 1;
            var close = findInlineCodeCloser(segment, runEnd, runEnd - tick);
            if (close === -1) {
                index = runEnd;
                continue;
            }
            protect(start + tick, start + close + (runEnd - tick));
            index = close + (runEnd - tick);
        }
    }

    var lines = source.split('\n');
    var offset = 0;
    var plainStart = 0;
    var fence = null;
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        var line = lines[lineIndex];
        var lineEnd = offset + line.length;
        var segmentEnd = lineEnd < source.length ? lineEnd + 1 : lineEnd;
        if (fence) {
            protect(offset, segmentEnd);
            var closeMarker = getMarkdownCodeFenceMarker(line, false);
            if (closeMarker && closeMarker.charAt(0) === fence.charAt(0) && closeMarker.length >= fence.length) fence = null;
            plainStart = segmentEnd;
        } else {
            var openMarker = getMarkdownCodeFenceMarker(line, true);
            if (openMarker) {
                protectInline(plainStart, offset);
                protect(offset, segmentEnd);
                fence = openMarker;
                plainStart = segmentEnd;
            }
        }
        offset = segmentEnd;
    }
    protectInline(plainStart, source.length);
    return protectedMask;
}

function isSecondStageRangeCodeProtected(mask, start, end) {
    for (var index = start; index < end; index++) {
        if (mask[index]) return true;
    }
    return false;
}

function getSecondStageOptionBlockRanges(content, isKnownSecondStageContent) {
    var text = String(content == null ? '' : content);
    var mask = getSecondStageCodeProtectionMask(text);
    var pattern = /<options\b[^>]*>[\s\S]*?<\/options\s*>/gi;
    var ranges = [];
    var match;
    while ((match = pattern.exec(text)) !== null) {
        var rangeEnd = match.index + match[0].length;
        if (isKnownSecondStageContent !== true && isSecondStageRangeCodeProtected(mask, match.index, rangeEnd)) continue;
        if (!parseSecondStageOptions(match[0]).length) continue;
        ranges.push({ start: match.index, end: rangeEnd });
    }
    return ranges;
}

function stripSecondStageOptionBlocks(content, isKnownSecondStageContent) {
    var text = String(content == null ? '' : content);
    var ranges = getSecondStageOptionBlockRanges(text, isKnownSecondStageContent);
    for (var index = ranges.length - 1; index >= 0; index--) {
        var start = ranges[index].start;
        while (start >= 2 && text.slice(start - 2, start) === '\r\n') start -= 2;
        while (start >= 1 && (text.charAt(start - 1) === '\n' || text.charAt(start - 1) === '\r')) start -= 1;
        text = text.slice(0, start) + text.slice(ranges[index].end);
    }
    return text.trim();
}

function isolatePrimaryStageContent(content) {
    var text = String(content || '');
    if (!state || !state.settings || !state.settings.twoStageEnabled) return text;
    return stripSecondStageOptionBlocks(text);
}

function decodeSecondStageOptionText(value) {
    var text = String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    text = text.replace(/&#x([0-9a-f]+);/gi, function(match, hex) {
        var code = parseInt(hex, 16);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
    text = text.replace(/&#([0-9]+);/g, function(match, digits) {
        var code = parseInt(digits, 10);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
    return text
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .trim();
}

function readSecondStageOptionTag(block, tagName) {
    var match = new RegExp('<' + tagName + '\\b[^>]*>([\\s\\S]*?)<\\/' + tagName + '\\s*>', 'i').exec(block);
    return match ? decodeSecondStageOptionText(match[1]) : '';
}

function parseSecondStageOptions(raw) {
    var text = String(raw || '').trim();
    if (!text) return [];
    var container = /<options\b[^>]*>/i.exec(text);
    if (!container) return [];
    text = text.slice(container.index + container[0].length);
    var options = [];
    var optionPattern = /<option\b[^>]*>([\s\S]*?)<\/option\s*>/gi;
    var match;
    while (options.length < 4 && (match = optionPattern.exec(text))) {
        var title = readSecondStageOptionTag(match[1], 'title');
        var description = readSecondStageOptionTag(match[1], 'description');
        if (!title && !description) continue;
        options.push({ title: title, description: description });
    }
    return options;
}

function escapeSecondStageOptionXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function normalizeSecondStageOptions(raw) {
    var options = parseSecondStageOptions(raw);
    if (!options.length) return '';
    var lines = ['<options>'];
    options.forEach(function(option) {
        lines.push('  <option>');
        lines.push('    <title>' + escapeSecondStageOptionXml(option.title) + '</title>');
        lines.push('    <description>' + escapeSecondStageOptionXml(option.description) + '</description>');
        lines.push('  </option>');
    });
    lines.push('</options>');
    return lines.join('\n');
}
