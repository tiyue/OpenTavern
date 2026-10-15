/**
 * 新手导读（文件：61-message-text-format.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“消息、文本、格式”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `escapeHtml(text)`、`highlightDialogue(text)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Message Text Formatting ====================
function escapeHtml(text) {
    if (!text) return '';
    text = String(text);
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function highlightDialogue(text) {
    if (!text) return '';
    var escaped = escapeHtml(text);
    // Highlight Chinese curly double quotes “...”
    escaped = escaped.replace(/“([\s\S]*?)”/g, '<span class="dialogue-highlight">“$1”</span>');
    // Highlight corner brackets 「...」
    escaped = escaped.replace(/「([\s\S]*?)」/g, '<span class="dialogue-highlight">「$1」</span>');
    return escaped;
}
