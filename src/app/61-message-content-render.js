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
function renderAssistantContent(text) {
    if (!text) return '';

    var raw = String(text);
    var optionsHtml = renderOptionsXml(raw);
    if (optionsHtml) return optionsHtml;

    var html = '';
    var lastIndex = 0;
    var statusBlockRe = /<details\b[\s\S]*?<\/details>/gi;
    var match;

    while ((match = statusBlockRe.exec(raw)) !== null) {
        var block = match[0];
        if (block.indexOf('状态栏') === -1 && block.indexOf('狀態欄') === -1) continue;

        html += highlightDialogue(raw.slice(lastIndex, match.index));
        html += sanitizeStatusBarHtml(block);
        lastIndex = match.index + block.length;
    }

    html += highlightDialogue(raw.slice(lastIndex));
    return html;
}

function renderMessageAttachments(msg) {
    if (!msg || !Array.isArray(msg.attachments) || msg.attachments.length === 0) return '';
    var html = '<div class="msg-attachments">';
    msg.attachments.forEach(function(att) {
        if (!att || att.type !== 'image') return;
        var src = att.dataUrl || att.url || '';
        if (!src) return;
        var label = att.source === 'comfyui' ? 'ComfyUI' : (att.source || 'Image');
        var prompt = att.prompt ? String(att.prompt) : '';
        html += '<figure>';
        html += '<img class="msg-attachment-image" src="' + escapeHtml(src) + '" alt="' + escapeHtml(label) + '" loading="lazy">';
        html += '<figcaption class="msg-attachment-caption">' + escapeHtml(label + (prompt ? ' · ' + prompt.slice(0, 180) : '')) + '</figcaption>';
        html += '</figure>';
    });
    html += '</div>';
    return html;
}

function renderMessageBubbleContent(msg, isUser) {
    var rawContent = msg && msg.content;
    if (!isUser && msg && msg.stage !== 'second') {
        rawContent = isolatePrimaryStageContent(rawContent);
    }
    var content = isUser ? escapeHtml(rawContent) : renderAssistantContent(rawContent);
    return content + renderMessageAttachments(msg);
}
