/**
 * 新手导读（文件：71-event-chat-composer-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、聊天、输入框、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindChatComposerEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Chat Composer Event Bindings ====================
function shouldSubmitComposerKeydown(event, settings) {
    if (!event || event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return false;
    var requireModifier = !(settings && settings.submitWithCmdEnter === false);
    if (requireModifier) return !!(event.metaKey || event.ctrlKey);
    return !event.shiftKey;
}

function bindChatComposerEvents() {
    if (typeof bindUserDraftEvents === 'function') bindUserDraftEvents();
    dom.sendBtn.addEventListener('click', sendMessage);
    if (dom.imageGenerationBtn) dom.imageGenerationBtn.addEventListener('click', openImageGenerationPanel);
    if (dom.imageGenerationSubmitBtn) dom.imageGenerationSubmitBtn.addEventListener('click', generateImageForCurrentChat);
    if (dom.imageGenerationCloseBtn) dom.imageGenerationCloseBtn.addEventListener('click', closeImageGenerationPanel);
    if (dom.imageGenerationBackdrop) dom.imageGenerationBackdrop.addEventListener('click', closeImageGenerationPanel);
    if (dom.imageGenerationPanel) dom.imageGenerationPanel.addEventListener('keydown', handleImageGenerationPanelKeydown);
    if (dom.imageGenerationCancelBtn) dom.imageGenerationCancelBtn.addEventListener('click', function() {
        if (imageGenerationIsGenerating) cancelImageGenerationRequest();
        else closeImageGenerationPanel();
    });

    dom.messageInput.addEventListener('keydown', function(e) {
        if (shouldSubmitComposerKeydown(e, state.settings)) {
            e.preventDefault();
            sendMessage();
        }
    });
    dom.messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    });

    if (dom.mentionBtn) {
        dom.mentionBtn.addEventListener('click', function() {
            var conv = getActiveConv();
            if (!isGroupChat(conv)) {
                alert(t('group_mention_no_group'));
                return;
            }
            showGroupMentionPanel(conv);
        });
    }

    if (dom.mentionPillClear) {
        dom.mentionPillClear.addEventListener('click', function(e) {
            e.stopPropagation();
            clearPendingGroupMention();
        });
    }

    if (dom.mentionPill) {
        dom.mentionPill.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'mentionPillClear') return;
            var conv = getActiveConv();
            if (conv && isGroupChat(conv)) {
                showGroupMentionPanel(conv);
            }
        });
    }

    dom.stopBtn.addEventListener('click', function() { stopGeneration(); });

    if (dom.newChatBtn) {
        dom.newChatBtn.addEventListener('click', function() {
            if (currentView === 'chat' && typeof showQuickNewChatModal === 'function') {
                showQuickNewChatModal();
            } else {
                showNewChatCharacterPicker();
            }
        });
    }

    dom.archiveBtn.addEventListener('click', archiveCurrentConversation);
}
