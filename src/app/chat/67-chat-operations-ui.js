var messageJumpSequence = 0;
async function jumpToConversationMessage(conversationId, messageId) {
    var sequence = ++messageJumpSequence;
    if (state.activeConvId !== conversationId) await loadConversation(conversationId);
    var conv = state.conversations[conversationId];
    if (sequence !== messageJumpSequence || !conv || getActiveConv() !== conv) return false;
    var visible = getRenderableChatMessages(conv);
    var index = visible.findIndex(function(message) { return message.id === messageId; });
    if (index < 0) return false;
    conv._historyWindow = Math.max(conv._historyWindow || 150, visible.length - index);
    conv._lastRenderedVisibleCount = 0;
    renderMessagesOnly();
    await new Promise(function(resolve) { requestAnimationFrame(resolve); });
    if (sequence !== messageJumpSequence || getActiveConv() !== conv) return false;
    var element = Array.from(dom.messagesContainer.querySelectorAll('[data-message-id]')).find(function(node) { return node.dataset.messageId === messageId; });
    if (!element) return false;
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    element.classList.add('message-jump-target');
    setTimeout(function() { element.classList.remove('message-jump-target'); }, 1800);
    return true;
}

function openMessageFinder(favoritesOnly) {
    var dialog = openFeatureDialog('messageFinderDialog', favoritesOnly ? '会话收藏' : '消息搜索',
        featureField('搜索原始正文', 'messageFindQuery', '') +
        featureSelect('范围', 'messageFindScope', 'current', [['current', '当前会话'], ['all', '全部会话']]) +
        '<p class="feature-hint" data-find-count></p><div data-find-results></div>', null);
    var query = dialog.querySelector('#messageFindQuery'), scope = dialog.querySelector('#messageFindScope');
    var timer, shown = 100, results = [];
    function render() {
        dialog.querySelector('[data-find-count]').textContent = results.length + ' 条结果' + (results.length > shown ? '，显示前 ' + shown + ' 条' : '');
        dialog.querySelector('[data-find-results]').innerHTML = results.slice(0, shown).map(function(result, index) {
            return '<button type="button" class="feature-search-result" data-find-result="' + index + '"><strong>' + escapeHtml(result.title || '未命名会话') + ' · ' + escapeHtml(result.sender) + '</strong><span>' + escapeHtml(result.snippet || '附件消息') + '</span></button>';
        }).join('') + (results.length > shown ? '<button type="button" data-find-more>显示更多</button>' : '');
    }
    function search() { shown = 100; results = findConversationMessages(query.value, scope.value, favoritesOnly); render(); }
    query.oninput = function() { clearTimeout(timer); timer = setTimeout(search, 150); };
    scope.onchange = search;
    dialog.addEventListener('close', function() { clearTimeout(timer); });
    dialog.addEventListener('click', async function(event) {
        if (event.target.closest('[data-find-more]')) { shown += 100; render(); return; }
        var button = event.target.closest('[data-find-result]');
        if (!button) return;
        var result = results[Number(button.dataset.findResult)];
        dialog.close();
        if (!await jumpToConversationMessage(result.conversationId, result.messageId)) alert('原消息已删除或会话切换已取消');
    });
    search();
}

function openConversationMembers() {
    var conv = getActiveConv();
    if (!conv || state.isGenerating) { alert('请先停止生成'); return; }
    var original = JSON.stringify([conv.group, conv.character]);
    var members = JSON.parse(JSON.stringify(conv.group && conv.group.members || (conv.character ? [{ character: conv.character, muted: false, order: 0 }] : [])));
    var choices = Object.keys(state.characters || {}).map(function(key) { return [key, state.characters[key].name]; });
    var dialog = openFeatureDialog('conversationMembersDialog', '会话成员',
        '<p class="feature-hint">只调整后续发言，保留历史消息、摘要和发言身份。</p><div data-member-list></div>' +
        featureSelect('从角色库添加', 'memberCharacter', '', [['', '选择角色']].concat(choices)) + '<button type="button" data-member-add>添加成员</button>', async function() {
            if (JSON.stringify([conv.group, conv.character]) !== original) throw new Error('成员已变化，请重新打开');
            await saveConversationMembers(conv, members);
        });
    function render() {
        dialog.querySelector('[data-member-list]').innerHTML = members.map(function(member, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(member.character.name) + '</strong><label class="feature-check"><input type="checkbox" data-member-mute="' + index + '"' + (member.muted ? ' checked' : '') + '>静音</label></span>' +
                '<button type="button" data-member-move="' + index + '" data-direction="-1"' + (!index ? ' disabled' : '') + '>上移</button><button type="button" data-member-move="' + index + '" data-direction="1"' + (index === members.length - 1 ? ' disabled' : '') + '>下移</button><button type="button" data-member-remove="' + index + '">移除</button></div>';
        }).join('');
    }
    dialog.addEventListener('change', function(event) { if (event.target.dataset.memberMute != null) members[Number(event.target.dataset.memberMute)].muted = event.target.checked; });
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button'); if (!button) return;
        if (button.hasAttribute('data-member-add')) {
            var character = state.characters[dialog.querySelector('#memberCharacter').value];
            if (character && !members.some(function(member) { return member.character.name.toLowerCase() === character.name.toLowerCase(); })) members.push({ character: JSON.parse(JSON.stringify(character)), muted: false, order: members.length });
        }
        if (button.dataset.memberRemove != null) members.splice(Number(button.dataset.memberRemove), 1);
        if (button.dataset.memberMove != null) {
            var from = Number(button.dataset.memberMove), to = from + Number(button.dataset.direction);
            if (to >= 0 && to < members.length) { var moved = members.splice(from, 1)[0]; members.splice(to, 0, moved); }
        }
        render();
    });
    render();
}

function bindChatOperationsEntries() {
    var parent = document.getElementById('conversationPromptControls').parentElement;
    parent.classList.add('feature-chat-tools');
    [['messageSearchEntry', '搜索', function() { openMessageFinder(false); }], ['messageFavoritesEntry', '收藏', function() { openMessageFinder(true); }], ['conversationMembersEntry', '成员', openConversationMembers]].forEach(function(entry) {
        var button = document.createElement('button'); button.type = 'button'; button.id = entry[0]; button.className = 'feature-entry feature-entry-compact'; button.textContent = entry[1]; button.onclick = entry[2]; parent.appendChild(button);
    });
}
