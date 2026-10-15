function getCharacterGreetings(character, group) {
    if (!character) return [];
    var greetings = [String(character.first_mes || '')].concat(Array.isArray(character.alternate_greetings) ? character.alternate_greetings : []);
    if (group && Array.isArray(character.group_only_greetings)) greetings = greetings.concat(character.group_only_greetings);
    return greetings.map(String);
}

function hydrateGreetingsEditor(character) {
    var container = document.getElementById('characterGreetingsEditor');
    if (!container) {
        container = document.createElement('div'); container.id = 'characterGreetingsEditor'; container.className = 'feature-inline';
        dom.charEditFirstMes.parentElement.after(container);
    }
    container.greetingDraft = { alternate_greetings: (character && character.alternate_greetings || []).slice(), group_only_greetings: (character && character.group_only_greetings || []).slice() };
    container.innerHTML = '<button type="button" data-greetings-kind="alternate_greetings">备选开场</button><button type="button" data-greetings-kind="group_only_greetings">群聊开场</button>';
    container.querySelectorAll('button').forEach(function(button) {
        button.onclick = function() {
            var kind = button.dataset.greetingsKind, values = container.greetingDraft[kind].slice();
            var dialog = openFeatureDialog('greetingsEditorDialog', button.textContent, '<div data-greetings-list></div><button type="button" data-greetings-add>添加开场</button>', function() {
                var value = Array.from(dialog.querySelectorAll('textarea')).map(function(input) { return input.value; });
                validateCharacterGreetings(value); container.greetingDraft[kind] = value;
            });
            function render() {
                dialog.querySelector('[data-greetings-list]').innerHTML = values.map(function(text, index) {
                    return '<div class="feature-row">' + featureField('开场 ' + (index + 1), 'greetingText' + index, text, 'textarea') + '<button type="button" data-greeting-remove="' + index + '">移除</button></div>';
                }).join('');
            }
            dialog.addEventListener('click', function(event) {
                var add = event.target.closest('[data-greetings-add]'), remove = event.target.closest('[data-greeting-remove]');
                if (!add && !remove) return;
                values = Array.from(dialog.querySelectorAll('textarea')).map(function(input) { return input.value; });
                if (add && values.length < 100) values.push('');
                if (remove) values.splice(Number(remove.dataset.greetingRemove), 1);
                render();
            });
            render();
        };
    });
}

function validateCharacterGreetings(value) {
    if (!Array.isArray(value) || value.length > 100 || value.some(function(item) { return typeof item !== 'string' || item.length > 500000; })) throw new Error('开场须为最多 100 项的文本数组');
}

function readGreetingsEditor(character) {
    var container = document.getElementById('characterGreetingsEditor');
    if (!container) return;
    ['alternate_greetings', 'group_only_greetings'].forEach(function(kind) {
        var value = container.greetingDraft[kind];
        validateCharacterGreetings(value); character[kind] = value.slice();
    });
}

async function switchConversationGreeting(conv, character, text) {
    if (!isLiveConversation(conv) || getActiveConv() !== conv || state.isGenerating || conv._messageCommitInProgress) throw new Error('请在当前会话停止生成后切换开场');
    var target = conv.messages.find(function(message) { return message.role !== 'system'; });
    var targetRevision = target && getMessageRevision(target);
    if (target && target.role !== 'assistant') throw new Error('当前会话没有可切换的开场');
    if (!String(text).trim()) throw new Error('开场不能为空');
    if (target && conv.messages.some(function(message) { return message !== target && message.role !== 'system'; })) {
        var notice = '切换开场会改变已有历史，并使相关摘要失效。继续？';
        var confirmed = typeof confirmFeatureAction === 'function' ? await confirmFeatureAction(notice, '切换开场') : await showGlassConfirm(notice, { title: '切换开场' });
        if (!confirmed) return false;
    }
    if (!isLiveConversation(conv) || getActiveConv() !== conv || state.isGenerating || target && (conv.messages.indexOf(target) < 0 || getMessageRevision(target) !== targetRevision)) throw new Error('开场消息已变化，请重新打开');
    var initial = typeof buildMvuInitialData === 'function' ? buildMvuInitialData(conv, { greetingText: text, character: character }).data : null;
    var content = replacePlaceholders(text, character.name, state.settings.userName || 'User', { conv: conv, mvuData: initial });
    if (target) {
        var revision = targetRevision, prepared = prepareResponseVersions(conv, target);
        var version = { id: makeId(), created: Date.now(), message: Object.assign(cloneResponseMessage(target), { content: content }), secondMessages: [] };
        if (typeof clearMvuManualOverride === 'function') clearMvuManualOverride(version.message);
        if (typeof prepareMvuGreetingCandidate === 'function') prepareMvuGreetingCandidate(conv, version, { rebuildInitial: true, greetingText: text, character: character });
        prepared.versions.push(version);
        await commitResponseVersion(conv, target, version, prepared.versions, function(c) { var current = c.messages.find(function(message) { return message.id === target.id; }); return current && getMessageRevision(current) === revision; });
    } else {
        var message = { id: makeId(), role: 'assistant', stage: 'main', content: content };
        if (isGroupChat(conv)) message.speaker = character.name;
        message.revision = getMessageRevision(message);
        await persistConversationMessageMutation(conv, function(candidate) { candidate.messages.push(message); }, { rebuildInitial: true, greetingText: text, character: character });
    }
    conv._lastRenderedVisibleCount = 0; renderMessagesOnly(); renderTokenBar();
}

function getConversationGreetingCharacter(conv, first) {
    var name = first && getMessageSenderName(first, conv);
    if (conv.character && (!name || conv.character.name === name)) return conv.character;
    var member = isGroupChat(conv) && getGroupMembers(conv).find(function(item) { return item.character && item.character.name === name; });
    if (member) return member.character;
    return findRegisteredCharacterByName(name) || (first && getMessageSpeakerCharacter(first, conv));
}

function openConversationGreetings(conv) {
    conv = conv || getActiveConv();
    if (!conv) return;
    var first = conv.messages.find(function(message) { return message.role !== 'system'; });
    var character = getConversationGreetingCharacter(conv, first) || (isGroupChat(conv) ? getGroupMembers(conv)[0].character : conv.character);
    var greetings = getCharacterGreetings(character, isGroupChat(conv));
    if (!character || !greetings.length) return;
    var dialog = openFeatureDialog('conversationGreetingsDialog', '选择开场', featureSelect('开场', 'greetingChoice', '0', greetings.map(function(text, index) { return [String(index), index === 0 ? '默认开场' : '备选开场 ' + index]; })) + '<pre class="feature-greeting-preview" data-greeting-preview></pre>', async function() {
        await switchConversationGreeting(conv, character, greetings[Number(dialog.querySelector('#greetingChoice').value)]);
    }, { saveLabel: '使用开场' });
    function preview() { dialog.querySelector('[data-greeting-preview]').textContent = greetings[Number(dialog.querySelector('#greetingChoice').value)] || '默认开场为空'; }
    dialog.querySelector('#greetingChoice').onchange = preview; preview();
}
