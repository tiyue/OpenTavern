// ==================== Chat Composer Event Bindings ====================
function bindChatComposerEvents() {
    dom.sendBtn.addEventListener('click', sendMessage);
    if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.addEventListener('click', generateComfyImageForCurrentChat);

    dom.messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
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
