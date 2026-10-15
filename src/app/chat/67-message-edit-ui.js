/**
 * 新手导读（文件：67-message-edit-ui.js）
 *
 * 负责什么：这是“消息操作”中的“消息、编辑、界面”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `copyMessageText(text)`、`editMessage(actualIdx, triggerBtn)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
// ==================== Message Copy/Edit UI ====================
function copyMessageText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            // Brief visual feedback could be added here.
        });
    }
}

function editMessage(actualIdx, triggerBtn) {
    var conv = getActiveConv();
    if (!conv || !conv.messages[actualIdx]) return;
    if (state.isGenerating) return;

    var originalContent = conv.messages[actualIdx].content || '';
    var targetId = conv.messages[actualIdx].id;
    var targetRevision = getMessageRevision(conv.messages[actualIdx]);
    var bubble = findEditableMessageBubble(actualIdx, triggerBtn);
    if (!bubble) {
        renderMessagesOnly();
        return;
    }

    var originalHTML = bubble.innerHTML;
    var ta = createMessageEditTextarea(originalContent, bubble.offsetWidth);
    var closed = false;

    bubble.innerHTML = '';
    bubble.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    function restoreOriginal() {
        closed = true;
        bubble.innerHTML = originalHTML;
    }

    async function saveEdit() {
        if (closed) return;
        closed = true;

        ta.disabled = true;
        try {
            var result = await persistConversationMessageMutation(conv, function(candidate) {
                var index = candidate.messages.findIndex(function(message) { return message.id === targetId && getMessageRevision(message) === targetRevision; });
                if (index < 0) throw new Error(t('generation_target_changed'));
                return applyMessageEditContent(candidate, index, originalContent, ta.value);
            });
            if (result === 'changed') {
                if (getActiveConv() === conv) renderMessagesOnly();
                renderConversationListOnly();
            } else bubble.innerHTML = originalHTML;
        } catch (error) {
            bubble.innerHTML = originalHTML;
            alert(t('generation_save_failed') + ': ' + error.message);
        }
    }

    ta.addEventListener('input', function() { autoResizeMessageEditTextarea(ta); });
    ta.addEventListener('blur', saveEdit);
    ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreOriginal();
        }
    });
    setTimeout(function() { autoResizeMessageEditTextarea(ta); }, 0);
}
