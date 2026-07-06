// ==================== Conversation List UI ====================
function renderConversationList() {
    if (!dom.convList) return;
    var order = (state.conversationOrder || []).slice();

    // Filter logic:
    // - In card library view: show ALL historical conversations
    // - After clicking a character card to enter chat: only show conversations related to currentCharacterName (including group chats)
    if (currentView === 'chat' && currentCharacterName) {
        const activeId = state.activeConvId;
        order = order.filter(function(id) {
            var c = state.conversations[id];
            if (!c) return false;
            // 始终保留当前激活的会话（尤其是群聊切换后 currentCharacterName 可能不匹配任一成员）
            if (id === activeId) return true;
            if (c.character && c.character.name === currentCharacterName) return true;
            if (c.group && Array.isArray(c.group.members)) {
                return c.group.members.some(function(m) {
                    return m.character && m.character.name === currentCharacterName;
                });
            }
            return false;
        });
    }

    if (order.length === 0) {
        dom.convList.innerHTML = '<p class="text-xs text-zinc-500 text-center py-8 px-2">' + t('no_conversations').replace(/\n/g,'<br>') + '</p>';
        return;
    }
    var html = '';
    for (var i = 0; i < order.length; i++) {
        var id = order[i], conv = state.conversations[id];
        if (!conv) continue;
        var isActive = id === state.activeConvId;
        var charName = conv.character ? conv.character.name : '';
        var title = conv.title || (charName ? t('chat_with') + charName : t('new_chat_title'));
        var date = new Date(conv.updated || conv.created).toLocaleDateString();
        html += '<div class="conv-item group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer ' + (isActive ? 'active' : '') + '" data-conv-id="' + id + '">';
        html += '<div class="flex-1 min-w-0" data-conv-id="' + id + '">';
        html += '<p class="text-xs font-medium text-zinc-300 truncate">' + escapeHtml(title) + '</p>';
        html += '<p class="text-[10px] text-zinc-500 truncate">' + (charName || t('no_character')) + ' &middot; ' + date + '</p>';
        html += '</div>';
        html += '<button class="conv-export-btn flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-[10px] opacity-0 group-hover:opacity-100" data-exp-id="' + id + '" title="' + t('conv_export_title') + '">&#128229;</button>';
        html += '<button class="conv-delete-btn flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs opacity-0 group-hover:opacity-100" data-del-id="' + id + '" title="Delete">&times;</button>';
        html += '</div>';
    }
    dom.convList.innerHTML = html;
    dom.convList.querySelectorAll('[data-conv-id]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            var id = el.getAttribute('data-conv-id');
            if (id) loadConversation(id);
        });
    });
    dom.convList.querySelectorAll('.conv-delete-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-del-id');
            if (id) deleteConversation(id);
        });
    });
    dom.convList.querySelectorAll('.conv-export-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-exp-id');
            if (id) exportConversation(id);
        });
    });
}
