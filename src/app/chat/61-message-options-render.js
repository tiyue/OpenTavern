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
function renderOptionChoices(options) {
    if (!options || !options.length) return '';
    var html = '<div class="space-y-2">';
    options.forEach(function(option) {
        var title = option.title;
        var desc = option.description;
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
    return html + '</div>';
}

function renderOptionsXml(raw, includeCodePayloads) {
    try {
        if (!/<options\b/i.test(String(raw || ''))) return '';
        return renderOptionChoices(messageDisplayModel.prepareOptions(raw, includeCodePayloads !== false));
    } catch (e) {
        return '';
    }
}
