/**
 * 新手导读（文件：64-conversation-list-helpers.js）
 *
 * 负责什么：这是“会话列表”中的“会话、列表、辅助函数”部分。
 * 在程序中的位置：它计算会话摘要信息并渲染侧边栏中的聊天记录。
 * 从哪里开始看：主要从 `conversationMatchesCurrentCharacterFilter(id, conv, activeId, characterName)`、`getVisibleConversationListOrder(无参数)`、`getConversationListTimestampOrder(order)`、`getConversationListTimestamp(conv)`、`buildConversationListEmptyHtml(无参数)`、`buildConversationListItemHtml(id, conv, isActive)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：列表项标识必须稳定，否则重命名或删除可能作用到错误会话。
 */
// ==================== Conversation List Helpers ====================
function conversationMatchesCurrentCharacterFilter(id, conv, activeId, characterName) {
    if (!conv) return false;
    if (id === activeId) return true;
    if (conv.character && conv.character.name === characterName) return true;
    if (conv.group && Array.isArray(conv.group.members)) {
        return conv.group.members.some(function(member) {
            return member.character && member.character.name === characterName;
        });
    }
    return false;
}

function getVisibleConversationListOrder() {
    var order = getConversationListTimestampOrder(getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations));
    if (currentView === 'chat' && currentCharacterName) {
        var activeId = state.activeConvId;
        order = order.filter(function(id) {
            return conversationMatchesCurrentCharacterFilter(id, state.conversations[id], activeId, currentCharacterName);
        });
    }
    return order;
}

function getConversationListTimestampOrder(order) {
    return order
        .filter(function(id) { return !!(state.conversations && state.conversations[id]); })
        .map(function(id, index) {
            return {
                id: id,
                index: index,
                timestamp: getConversationListTimestamp(state.conversations[id])
            };
        })
        .sort(function(a, b) {
            return (b.timestamp - a.timestamp) || (a.index - b.index);
        })
        .map(function(item) { return item.id; });
}

function getConversationListTimestamp(conv) {
    return getConversationActivityTimestamp(conv);
}

function buildConversationListEmptyHtml() {
    return '<p class="text-xs text-zinc-500 text-center py-8 px-2">' + t('no_conversations').replace(/\n/g,'<br>') + '</p>';
}

function buildConversationListItemHtml(id, conv, isActive) {
    var charName = conv.character ? conv.character.name : '';
    var title = conv.title || (charName ? t('chat_with') + charName : t('new_chat_title'));
    var timestamp = getConversationListTimestamp(conv);
    var date = timestamp ? new Date(timestamp).toLocaleDateString() : '';
    var metaHtml = escapeHtml(charName || t('no_character'));
    if (date) metaHtml += ' &middot; ' + escapeHtml(date);
    var html = '';
    html += '<div class="conv-item group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer ' + (isActive ? 'active' : '') + '" data-conv-id="' + id + '">';
    html += '<div class="flex-1 min-w-0" data-conv-id="' + id + '">';
    html += '<p class="text-xs font-medium text-zinc-300 truncate">' + escapeHtml(title) + '</p>';
    html += '<p class="text-[10px] text-zinc-500 truncate">' + metaHtml + '</p>';
    html += '</div>';
    html += '<button class="conv-export-btn flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-[10px] opacity-0 group-hover:opacity-100" data-exp-id="' + id + '" title="' + t('conv_export_title') + '">&#128229;</button>';
    html += '<button class="conv-delete-btn flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs opacity-0 group-hover:opacity-100" data-del-id="' + id + '" title="Delete">&times;</button>';
    html += '</div>';
    return html;
}
