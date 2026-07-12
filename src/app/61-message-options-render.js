/**
 * 新手导读（文件：61-message-options-render.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“消息、选项、渲染”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderOptionsXml(raw)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Message Options Rendering ====================
function renderOptionsXml(raw) {
    var text = String(raw || '').trim();
    if (!/^<options[\s>]/i.test(text)) return '';
    try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return '';
        var optionNodes = Array.prototype.slice.call(doc.getElementsByTagName('option')).slice(0, 4);
        if (!optionNodes.length) return '';
        var html = '<div class="space-y-2">';
        optionNodes.forEach(function(node) {
            var titleNode = node.getElementsByTagName('title')[0];
            var descNode = node.getElementsByTagName('description')[0];
            var title = titleNode ? titleNode.textContent.trim() : '';
            var desc = descNode ? descNode.textContent.trim() : '';
            var activationHint = t('message_option_activation_hint') || '单击选中，再次点击发送';
            var selectedHint = t('message_option_selected_hint') || '已选中 · 再次点击发送';
            html += '<button type="button" class="message-option-choice glass rounded-xl border border-white/10 px-3 py-2"' +
                ' data-option-title="' + escapeHtml(title) + '" data-option-description="' + escapeHtml(desc) + '"' +
                ' aria-pressed="false" title="' + escapeHtml(activationHint) + '">';
            if (title) html += '<div class="text-sm font-semibold text-amber-300 mb-1">' + escapeHtml(title) + '</div>';
            if (desc) html += '<div class="text-sm text-zinc-300 leading-relaxed">' + highlightDialogue(desc) + '</div>';
            html += '<span class="message-option-selected-hint" aria-hidden="true">' + escapeHtml(selectedHint) + '</span>';
            html += '</button>';
        });
        html += '</div>';
        return html;
    } catch (e) {
        return '';
    }
}
