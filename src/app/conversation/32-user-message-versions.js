// 用户正文版本与回复关联使用普通消息字段，随现有备份和同步往返。
function getUserMessageVersionState(msg) {
    if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') return { versions: [], current: null };
    var source = Array.isArray(msg.userVersions) ? msg.userVersions : (Array.isArray(msg.editHistory) ? msg.editHistory : []);
    var used = new Set();
    var versions = source.map(function(record, index) {
        if (typeof record === 'string') record = { content: record };
        if (!record || typeof record.content !== 'string') return null;
        var id = typeof record.id === 'string' && record.id ? record.id : 'user-' + fingerprintMessageText(JSON.stringify([msg.id || '', index, record.content]));
        if (used.has(id)) return null;
        used.add(id);
        return { id: id, content: record.content, created: Number(record.created || record.createdAt) || 0 };
    }).filter(Boolean);
    var current = versions.find(function(version) { return version.id === msg.selectedUserVersionId && version.content === msg.content; });
    if (!current) current = versions.find(function(version) { return version.content === msg.content; });
    if (!current) {
        var id = 'user-' + fingerprintMessageText(JSON.stringify([msg.id || '', msg.content]));
        while (used.has(id)) id += '-current';
        current = { id: id, content: msg.content, created: Number(msg.created) || 0 };
        versions.push(current);
    }
    return { versions: versions, current: current };
}

function findResponseUserMessage(conv, msg) {
    if (!conv || !msg || !Array.isArray(conv.messages)) return null;
    var index = conv.messages.findIndex(function(message) { return message.id === (msg.stage === 'second' ? msg.parentId : msg.id); });
    for (var i = index - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'user') return conv.messages[i];
    }
    return null;
}

function getResponseUserVersionLink(conv, msg) {
    var user = findResponseUserMessage(conv, msg);
    var current = getUserMessageVersionState(user).current;
    return current ? { userMessageId: user.id, userVersionId: current.id, userContent: current.content } : null;
}

function responseUserVersionSource(conv, msg) {
    var user = findResponseUserMessage(conv, msg);
    return user ? JSON.stringify([user.id, getMessageRevision(user), user.userVersions, user.selectedUserVersionId]) : null;
}

function selectUserMessageContent(msg, content, versionId) {
    if (!msg || msg.role !== 'user' || typeof content !== 'string' || (!content.trim() && !(typeof getUserVisionAttachments === 'function' && getUserVisionAttachments(msg).length))) throw new Error('用户消息正文必须是非空文本。');
    var prepared = getUserMessageVersionState(msg);
    var version = versionId ? prepared.versions.find(function(item) { return item.id === versionId; }) : null;
    if (version && version.content !== content) throw new Error('用户消息版本与正文不一致。');
    if (!version) version = prepared.versions.find(function(item) { return item.content === content; });
    if (!version) {
        version = { id: versionId || makeId(), content: content, created: Date.now() };
        prepared.versions.push(version);
    }
    msg.userVersions = prepared.versions;
    msg.selectedUserVersionId = version.id;
    msg.content = content;
    msg.revision = getMessageRevision(msg);
    return version;
}

function rememberUserReplyVersions(conv, user) {
    var index = conv.messages.indexOf(user);
    for (var i = index + 1; i < conv.messages.length; i++) {
        var reply = conv.messages[i];
        if (reply.role === 'user') break;
        if (reply.role !== 'assistant' || reply.stage === 'second' || reply.stage === 'scene' || !String(reply.content || '').trim()) continue;
        var prepared = prepareResponseVersions(conv, reply);
        if (!prepared.current.userMessageId) Object.assign(prepared.current, getResponseUserVersionLink(conv, reply));
        reply.responseVersions = prepared.versions;
        reply.selectedResponseVersionId = prepared.current.id;
    }
}

function restoreResponseUserVersion(conv, target, version) {
    if (version.userMessageId === undefined && version.userVersionId === undefined && version.userContent === undefined) return null;
    if (typeof version.userMessageId !== 'string' || !version.userMessageId || typeof version.userVersionId !== 'string' || !version.userVersionId || typeof version.userContent !== 'string') throw new Error('回复关联的用户版本无效。');
    var user = findResponseUserMessage(conv, target);
    if (!user || user.id !== version.userMessageId) throw new Error('回复关联的用户消息已变化。');
    selectUserMessageContent(user, version.userContent, version.userVersionId);
    return user;
}

async function switchUserMessageVersion(conv, messageId, versionId) {
    if (state.isGenerating || !isLiveConversation(conv) || getActiveConv() !== conv) throw new Error(t('generation_target_changed'));
    var target = conv.messages.find(function(message) { return message.id === messageId && message.role === 'user'; });
    var version = getUserMessageVersionState(target).versions.find(function(item) { return item.id === versionId; });
    if (!version) throw new Error('用户消息版本不存在。');
    await persistConversationMessageMutation(conv, function(candidate) {
        var index = candidate.messages.findIndex(function(message) { return message.id === messageId; });
        return applyMessageEditContent(candidate, index, target.content, version.content);
    }, { validate: function() { return !state.isGenerating && getActiveConv() === conv; } });
    if (getActiveConv() === conv) { renderMessagesOnly(); renderTokenBar(); }
}

function openMessageVersionHistory(actualIdx) {
    var conv = getActiveConv(), msg = conv && conv.messages[actualIdx];
    if (!msg || state.isGenerating) return;
    var prepared = msg.role === 'user' ? getUserMessageVersionState(msg) : prepareResponseVersions(conv, msg);
    var versions = prepared.versions;
    var source = JSON.stringify(msg);
    var dialog = openFeatureDialog('messageVersionHistoryDialog', msg.role === 'user' ? '用户消息历史' : '回复历史', '<div data-message-versions></div>', null);
    var host = dialog.querySelector('[data-message-versions]');
    versions.forEach(function(version, index) {
        var row = document.createElement('div'); row.className = 'feature-row';
        var text = document.createElement('span');
        var content = msg.role === 'user' ? version.content : version.message.content;
        text.textContent = '版本 ' + (index + 1) + (version.userContent !== undefined ? ' · 对应用户：' + version.userContent.slice(0, 100) : '') + '\n' + content;
        text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere';
        var button = document.createElement('button'); button.type = 'button'; button.textContent = '使用此版本';
        button.addEventListener('click', async function() {
            button.disabled = true;
            try {
                if (getActiveConv() !== conv || state.isGenerating || JSON.stringify(msg) !== source) throw new Error(t('generation_target_changed'));
                if (msg.role === 'user') await switchUserMessageVersion(conv, msg.id, version.id);
                else {
                    state.isGenerating = true; appStore.notify('isGenerating');
                    try { await commitResponseVersion(conv, msg, version, versions); }
                    finally { state.isGenerating = false; appStore.notify('isGenerating'); }
                }
                dialog.close();
            } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; button.disabled = false; }
        });
        row.append(text, button); host.appendChild(row);
    });
}
