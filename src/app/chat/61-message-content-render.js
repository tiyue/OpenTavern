/**
 * 新手导读（文件：61-message-content-render.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“消息、内容、渲染”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderAssistantContent(text)`、`renderMessageAttachments(msg)`、`renderMessageBubbleContent(msg, isUser)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Message Content Rendering ====================
// dream 系列控制标签只是包装：显示时只去掉标记本身，保留全部正文（含 after_format 内的状态栏/选项），
// 不动未知标签；代码围栏里作为示例的标记、以及行内代码（含变长、跨行）中的标记都保留。
function stripDreamMarkersFromSegment(segment) {
    return segment.replace(/<\/?dream_(?:plot|body|after_format|done)\b[^>]*>/gi, '');
}

function stripDreamMarkersOutsideFence(text) {
    var result = '';
    var index = 0;
    while (index < text.length) {
        var tick = text.indexOf('`', index);
        if (tick === -1) return result + stripDreamMarkersFromSegment(text.slice(index));
        result += stripDreamMarkersFromSegment(text.slice(index, tick));
        var end = tick;
        while (end < text.length && text.charAt(end) === '`') end += 1;
        var close = findInlineCodeCloser(text, end, end - tick);
        if (close === -1) { result += text.slice(tick, end); index = end; continue; }
        result += text.slice(tick, close + (end - tick));
        index = close + (end - tick);
    }
    return result;
}

// 围栏只在同一字符、闭合标记不短于开启标记且其后仅空白时关闭；不同字符或缺长度的标记行仍属于代码。
function getDreamFenceMarker(line, opening) {
    return getMarkdownCodeFenceMarker(line, opening);
}

// 围栏行原样保留；围栏外的整段文本一起交给行内代码扫描（因此行内代码可跨行）。
function stripDreamControlWrappers(text) {
    var source = String(text == null ? '' : text);
    if (source.toLowerCase().indexOf('dream_') === -1) return source;
    var lines = source.split('\n');
    var output = [];
    var plain = [];
    var fence = null;
    function flushPlain() {
        if (!plain.length) return;
        stripDreamMarkersOutsideFence(plain.join('\n')).split('\n').forEach(function(line) { output.push(line); });
        plain = [];
    }
    for (var index = 0; index < lines.length; index++) {
        var line = lines[index];
        if (fence) {
            var close = getDreamFenceMarker(line, false);
            output.push(line);
            if (close && close.charAt(0) === fence.charAt(0) && close.length >= fence.length) fence = null;
            continue;
        }
        var open = getDreamFenceMarker(line, true);
        if (open) {
            flushPlain();
            fence = open;
            output.push(line);
            continue;
        }
        plain.push(line);
    }
    flushPlain();
    return output.join('\n');
}

function renderAssistantDisplayContent(raw, secondStageContent) {
    return prepareMessageDisplay({
        text: raw,
        processMessage: false,
        secondStageContent: !!secondStageContent
    }).display.html;
}

function renderAssistantContent(text, context) {
    if (!text) return '';
    var prepared = prepareMessageDisplay({ text: text, context: context, stage: context && context.stage, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
    return renderPreparedAssistantContent(prepared);
}

function renderPreparedAssistantContent(prepared) {
    if (!prepared.secondStageContent && prepared.context.conv && prepared.context.msg && typeof renderCardRuntimeContent === 'function') {
        var runtimeHtml = renderCardRuntimeContent(prepared.executableText, prepared.context, prepared);
        if (runtimeHtml !== null) return runtimeHtml + prepared.noticeHtml;
    }
    return prepared.display.html + prepared.noticeHtml;
}

function renderMessageBubbleContent(msg, isUser, context) {
    context = Object.assign({}, context || {}, {
        msg: msg,
        messageRole: isUser ? 'user' : 'assistant',
        processingPhase: 'display',
        sourcePlacement: isUser ? 'USER_INPUT' : 'AI_OUTPUT'
    });
    var prepared = prepareMessageDisplay({
        text: msg && msg.content,
        context: context,
        messageRole: context.messageRole,
        sourcePlacement: context.sourcePlacement,
        stage: msg && msg.stage,
        isolatePrimary: !isUser && msg && msg.stage !== 'second',
        settings: context.settings || (typeof state !== 'undefined' && state.settings)
    });
    var content = isUser ? escapeHtml(prepared.formattedText) : renderPreparedAssistantContent(prepared);
    return content + renderMessageAttachments(msg);
}
