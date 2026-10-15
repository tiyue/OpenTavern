/**
 * 助手消息头像辅助：从会话、群成员、角色库与公开卡片元数据中解析发言角色。
 * 仅负责显示，不改变会话成员、角色卡或消息内容。
 */
function findRegisteredCharacterByName(name) {
    var normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName || !state.characters) return null;
    if (state.characters[normalizedName]) return state.characters[normalizedName];
    var keys = Object.keys(state.characters);
    for (var i = 0; i < keys.length; i++) {
        var character = state.characters[keys[i]];
        if (character && String(character.name || '').trim().toLowerCase() === normalizedName) return character;
    }
    return null;
}

function getMessageSpeakerCharacter(msg, conv) {
    if (!conv) return null;
    var author = msg && conv.messageAuthorNames && Object.prototype.hasOwnProperty.call(conv.messageAuthorNames, msg.id) ? conv.messageAuthorNames[msg.id] : '';
    var speakerName = String(msg && msg.speaker || (typeof author === 'string' ? author : '')).trim();
    if (speakerName && conv.pastMemberCharacters && Object.prototype.hasOwnProperty.call(conv.pastMemberCharacters, speakerName)) return conv.pastMemberCharacters[speakerName];
    if (speakerName && !isGroupChat(conv)) return findRegisteredCharacterByName(speakerName) || (conv.character && conv.character.name === speakerName ? conv.character : { name: speakerName });
    if (isGroupChat(conv)) {
        var members = getGroupMembers(conv);
        var normalizedSpeaker = speakerName.toLowerCase();
        for (var i = 0; i < members.length; i++) {
            var memberCharacter = members[i] && members[i].character;
            if (memberCharacter && String(memberCharacter.name || '').trim().toLowerCase() === normalizedSpeaker) {
                return findRegisteredCharacterByName(memberCharacter.name) || memberCharacter;
            }
        }
        return findRegisteredCharacterByName(speakerName) || (speakerName ? { name: speakerName } : (members[0] && members[0].character)) || null;
    }
    return findRegisteredCharacterByName(conv.character && conv.character.name) || conv.character || null;
}

function findPublicMessageAvatarSource(character) {
    if (!character || typeof PUBLIC_CARDS === 'undefined' || !Array.isArray(PUBLIC_CARDS)) return '';
    var normalizedName = String(character.name || '').trim().toLowerCase();
    if (!normalizedName) return '';
    for (var i = 0; i < PUBLIC_CARDS.length; i++) {
        var card = PUBLIC_CARDS[i];
        var names = [card && card.name, card && card.nameEn].filter(Boolean).map(function(value) {
            return String(value).trim().toLowerCase();
        });
        if (names.indexOf(normalizedName) !== -1) return String(card.previewImage || card.avatar || '');
    }
    return '';
}

function getMessageAvatarSource(character) {
    if (!character) return '';
    var registered = findRegisteredCharacterByName(character.name);
    var source = String(
        registered && (registered.previewImage || registered.avatar)
        || character.previewImage
        || character.avatar
        || findPublicMessageAvatarSource(character)
        || ''
    ).trim();
    return typeof resolvePublicCardAssetUrl === 'function' ? resolvePublicCardAssetUrl(source, true) : source;
}

function renderMessageAvatarHtml(displayName, imageSource) {
    if (!state.settings || !state.settings.showReplyAvatar) return '';
    var name = String(displayName || '?');
    var initial = escapeHtml(name.charAt(0).toUpperCase() || '?');
    if (imageSource) {
        return '<div class="msg-avatar" aria-hidden="true"><img src="' + escapeHtml(imageSource) + '" alt="" onerror="this.parentNode.classList.add(\'msg-avatar--letter\');this.remove()"><span>' + initial + '</span></div>';
    }
    return '<div class="msg-avatar msg-avatar--letter ot-avatar-fill" aria-hidden="true"><span>' + initial + '</span></div>';
}

function renderAssistantSenderHtml(senderName, character) {
    var name = String(senderName || '');
    var nameHtml = '<p class="msg-sender-name">' + escapeHtml(name) + '</p>';
    if (!state.settings || !state.settings.showReplyAvatar) {
        return '<div class="msg-sender-row msg-sender-row--name-only">' + nameHtml + '</div>';
    }
    return '<div class="msg-sender-row">' +
        renderMessageAvatarHtml(character && character.name || name, getMessageAvatarSource(character)) +
        nameHtml +
        '</div>';
}
