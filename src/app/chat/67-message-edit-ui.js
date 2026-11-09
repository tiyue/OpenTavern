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
    var conv = getActiveConv(), msg = conv && conv.messages[actualIdx];
    if (!msg || state.isGenerating || conv._messageCommitInProgress) return;
    var originalContent = msg.content || '', targetId = msg.id, targetRevision = getMessageRevision(msg);
    var bubble = findEditableMessageBubble(actualIdx, triggerBtn);
    if (!bubble) return;
    var originalHTML = bubble.innerHTML;
    var ta = createMessageEditTextarea(originalContent, bubble.offsetWidth);
    var controls = document.createElement('div'); controls.className = 'flex flex-wrap gap-2 mt-2';
    var errorText = document.createElement('p'); errorText.className = 'feature-error'; errorText.setAttribute('role', 'alert');
    var saving = false, closed = false;
    bubble.replaceChildren(ta, controls, errorText); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    function restore() { if (saving) return; closed = true; bubble.innerHTML = originalHTML; }
    async function save(regenerate) {
        if (saving || closed) return;
        if (!ta.value.trim()) { errorText.textContent = '正文不能为空。'; ta.focus(); return; }
        if (ta.value.trim() === originalContent && !regenerate) { restore(); return; }
        if (msg.role === 'user' && regenerate && conv.messages.slice(actualIdx + 1).some(function(item) { return item.role === 'user'; })) {
            if (!await confirmFeatureAction('将创建新分支重新生成，原会话和后续消息完整保留。', '保存并重新生成')) return;
        }
        saving = true; ta.disabled = true; controls.querySelectorAll('button').forEach(function(button) { button.disabled = true; });
        try {
            if (msg.role === 'user') await saveUserMessageEdit(conv, targetId, targetRevision, ta.value, regenerate);
            else await persistConversationMessageMutation(conv, function(candidate) {
                var index = candidate.messages.findIndex(function(item) { return item.id === targetId && getMessageRevision(item) === targetRevision; });
                if (index < 0) throw new Error(t('generation_target_changed'));
                return applyMessageEditContent(candidate, index, originalContent, ta.value);
            }, { validate: function() { return !state.isGenerating && getActiveConv() === conv; } });
            closed = true;
            if (getActiveConv() === conv) renderMessagesOnly();
            renderConversationListOnly();
        } catch (error) { errorText.textContent = t('generation_save_failed') + ': ' + error.message; }
        finally { saving = false; ta.disabled = false; controls.querySelectorAll('button').forEach(function(button) { button.disabled = false; }); }
    }
    (msg.role === 'user' ? [['保存并重新生成', function() { return save(true); }], ['仅保存', function() { return save(false); }]] : [['保存', function() { return save(false); }]]).concat([['取消', restore]]).forEach(function(item) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'msg-action-btn message-text-action'; button.textContent = item[0]; button.addEventListener('click', item[1]); controls.appendChild(button);
    });
    ta.addEventListener('input', function() { autoResizeMessageEditTextarea(ta); });
    ta.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') { event.preventDefault(); restore(); }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(msg.role === 'user'); }
    });
    autoResizeMessageEditTextarea(ta);
}
