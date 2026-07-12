/**
 * 新手导读（文件：61-message-status-bar-render.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“消息、状态、工具栏、渲染”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `sanitizeStatusBarHtml(html)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Message Status Bar Rendering ====================
function sanitizeStatusBarHtml(html) {
    if (!window.DOMPurify) return highlightDialogue(html);

    var clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['details', 'summary', 'div', 'br', 'span', 'b', 'strong'],
        ALLOWED_ATTR: ['open'],
        ALLOW_DATA_ATTR: false,
        FORBID_ATTR: ['style', 'class', 'id', 'onclick', 'onerror', 'onload']
    });

    clean = clean.replace(/<details([^>]*)>/i, function(match, attrs) {
        return '<details class="status-bar"' + (/\bopen\b/i.test(attrs || '') ? ' open' : '') + '>';
    });
    clean = clean.replace(/<summary>/i, '<summary>');
    clean = clean.replace(/(<\/summary>)([\s\S]*?)(<\/details>)/i, '$1<div class="status-bar-content">$2</div>$3');

    return clean;
}
