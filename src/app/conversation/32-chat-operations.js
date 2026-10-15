function normalizeConversationFavorites(conv) {
    var liveIds = new Set((conv.messages || []).map(function(message) { return message.id; }));
    conv.favoriteMessageIds = Array.from(new Set(Array.isArray(conv.favoriteMessageIds) ? conv.favoriteMessageIds : [])).filter(function(id) { return liveIds.has(id); });
    return conv.favoriteMessageIds;
}

async function toggleMessageFavorite(conv, id) {
    if (!isLiveConversation(conv) || conv._messageCommitInProgress) return;
    var before = normalizeConversationFavorites(conv).slice();
    if (!conv.messages.some(function(message) { return message.id === id; })) return;
    var next = before.includes(id) ? before.filter(function(value) { return value !== id; }) : before.concat(id);
    var oldUpdated = conv.updated;
    var candidate = Object.assign({}, conv, { favoriteMessageIds: next, updated: Date.now() });
    await persistConversationMutation(conv, function(c) { if (JSON.stringify(c.favoriteMessageIds) === JSON.stringify(next)) { c.favoriteMessageIds = before; if (c.updated === candidate.updated) c.updated = oldUpdated; } }, candidate, function(c, validateOnly) {
        if (!c.messages.some(function(message) { return message.id === id; }) || JSON.stringify(c.favoriteMessageIds || []) !== JSON.stringify(before)) return false;
        if (!validateOnly) { c.favoriteMessageIds = next.slice(); if (c.updated === oldUpdated) c.updated = candidate.updated; }
        return true;
    });
    if (getActiveConv() === conv) { conv._lastRenderedVisibleCount = 0; renderMessagesOnly(); }
}

function findConversationMessages(query, scope, favoritesOnly) {
    var text = String(query || '').trim().toLocaleLowerCase();
    var ids = scope === 'all' ? state.conversationOrder.concat(Object.keys(state.conversations)) : [state.activeConvId];
    var results = [];
    Array.from(new Set(ids)).forEach(function(id) {
        var conv = state.conversations[id];
        if (!conv) return;
        var favorites = new Set(normalizeConversationFavorites(conv));
        conv.messages.forEach(function(message) {
            if (message.role === 'system' || favoritesOnly && !favorites.has(message.id)) return;
            var content = String(message.content || '');
            var index = content.toLocaleLowerCase().indexOf(text);
            if (text && index < 0) return;
            if (!text && !favoritesOnly) return;
            var start = Math.max(0, index - 48);
            results.push({ conversationId: id, messageId: message.id, title: conv.title, sender: getMessageSenderName(message, conv), snippet: (start ? '…' : '') + content.slice(start, start + 180) + (content.length > start + 180 ? '…' : '') });
        });
    });
    return results;
}

function canContinueMessage(conv, message) {
    if (!conv || !message || message.role !== 'assistant' || message.stage === 'second' || !String(message.content || '').trim()) return false;
    return conv.messages.filter(function(m) { return m.role !== 'system' && m.stage !== 'second'; }).slice(-1)[0] === message;
}

function validateConversationMembers(members) {
    if (!Array.isArray(members) || !members.length || members.length > 50) throw new Error('须保留 1–50 个成员');
    var names = new Set();
    members.forEach(function(member) {
        var name = String(member && member.character && member.character.name || '').trim().toLowerCase();
        if (!name || names.has(name)) throw new Error('成员名称为空或重复');
        names.add(name);
    });
    if (!members.some(function(member) { return !member.muted; })) throw new Error('至少保留一个未静音成员');
}

async function saveConversationMembers(conv, members) {
    if (state.isGenerating || getActiveConv() !== conv || !isLiveConversation(conv)) throw new Error('请在当前会话停止生成后修改成员');
    validateConversationMembers(members);
    var original = JSON.stringify([conv.group, conv.character]);
    var past = Object.assign(Object.create(null), conv.pastMemberCharacters || {});
    var authors = Object.assign(Object.create(null), conv.messageAuthorNames || {});
    conv.messages.forEach(function(message) {
        if (message.role !== 'assistant') return;
        var character = getMessageSpeakerCharacter(message, conv);
        var name = getMessageSenderName(message, conv);
        if (!message.speaker && !authors[message.id]) authors[message.id] = name;
        if (character && !past[name]) past[name] = JSON.parse(JSON.stringify(character));
    });
    var nextMembers = JSON.parse(JSON.stringify(members));
    nextMembers.forEach(function(member, index) { member.order = index; });
    var fields = {
        group: Object.assign({}, conv.group || createNewChatGroupMetadata(nextMembers.map(function(member) { return member.character; }), nextMembers), { members: nextMembers }),
        character: nextMembers[0].character, pastMemberCharacters: past, messageAuthorNames: authors
    };
    var candidate = Object.assign({}, conv, fields, { updated: Date.now() });
    await persistConversationMutation(conv, function() {}, candidate, function(c, validateOnly) {
        if (JSON.stringify([c.group, c.character]) !== original) return false;
        if (!validateOnly) { Object.assign(c, JSON.parse(JSON.stringify(fields))); c.updated = candidate.updated; c._wiCache = null; delete c._nextGroupSpeaker; }
        return true;
    });
    if (getActiveConv() === conv) { conv._lastRenderedVisibleCount = 0; requestFullRender(); }
}
