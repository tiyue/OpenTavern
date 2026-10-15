// ==================== Image Generation Prompt Builder ====================
function buildImageGenerationPromptText(conv) {
    // 保留旧公开入口，但采集规则与当前图文流程一致：只取最近一次主回复正文。
    return getLatestAssistantImageGenerationText(conv).slice(0, 5000);
}

function buildImageGenerationPrompt(conv) {
    return buildImageGenerationPromptText(conv);
}

function buildImageGenerationCharacterText(conv) {
    var characters = [];
    if (conv && isGroupChat(conv)) {
        characters = getGroupMembers(conv).map(function(member) {
            return member && member.character;
        }).filter(Boolean);
    } else if (conv && conv.character) {
        characters = [conv.character];
    }

    return characters.map(function(character) {
        var parts = [];
        if (character.name) parts.push('角色：' + cleanImageGenerationPromptText(character.name));
        if (character.description) parts.push('外观与设定：' + cleanImageGenerationPromptText(character.description).slice(0, 900));
        if (character.personality) parts.push('性格：' + cleanImageGenerationPromptText(character.personality).slice(0, 500));
        if (character.scenario) parts.push('场景设定：' + cleanImageGenerationPromptText(character.scenario).slice(0, 700));
        return parts.join('\n');
    }).filter(Boolean).join('\n\n');
}

function buildImageGenerationContextText(conv, limit) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    var selected = [];
    for (var i = messages.length - 1; i >= 0 && selected.length < (limit || 4); i--) {
        var message = messages[i];
        var content = cleanImageGenerationPromptText(message && message.content);
        if (!content) continue;
        var speaker = message.speaker || (message.role === 'user' ? (state.settings.userName || 'User') : '角色');
        selected.unshift(cleanImageGenerationPromptText(speaker) + '：' + content.slice(0, 700));
    }
    return selected.join('\n').slice(0, 2600);
}

function getLatestAssistantImageGenerationText(conv) {
    var message = getLatestPrimaryAssistantImageGenerationMessage(conv);
    return message ? cleanPrimaryImageGenerationText(message.content).slice(0, 30000) : '';
}

function getLatestPrimaryAssistantImageGenerationMessage(conv) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    for (var i = messages.length - 1; i >= 0; i--) {
        var message = messages[i];
        if (!message || message.role !== 'assistant' || message.stage === 'second') continue;
        // stage=main 是当前格式；stage 缺失仅用于兼容旧会话。图片附件空消息会自然跳过。
        if (message.stage && message.stage !== 'main') continue;
        if (cleanPrimaryImageGenerationText(message.content)) return message;
    }
    return null;
}

function cleanPrimaryImageGenerationText(value) {
    var text = typeof stripSecondStageOptionBlocks === 'function'
        ? stripSecondStageOptionBlocks(value)
        : String(value || '')
            .replace(/(?:\r?\n)*<options\b[^>]*>[\s\S]*?<\/options>/gi, '')
            .replace(/(?:\r?\n)*<options\b[^>]*>[\s\S]*$/gi, '')
            .trim();
    return cleanImageGenerationPromptText(text);
}

function getImageGenerationRegisteredCharacter(name) {
    var normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName || typeof state === 'undefined' || !state || !state.characters) return null;
    if (state.characters[normalizedName]) return state.characters[normalizedName];
    var keys = Object.keys(state.characters);
    for (var i = 0; i < keys.length; i++) {
        var character = state.characters[keys[i]];
        if (character && String(character.name || '').trim().toLowerCase() === normalizedName) return character;
    }
    return null;
}

function getImageGenerationMessageCharacter(conv, message) {
    var candidate = null;
    if (conv && typeof isGroupChat === 'function' && isGroupChat(conv)) {
        var speaker = String(message && message.speaker || '').trim().toLowerCase();
        var members = typeof getGroupMembers === 'function' ? getGroupMembers(conv) : [];
        for (var i = 0; i < members.length; i++) {
            var memberCharacter = members[i] && members[i].character;
            if (memberCharacter && String(memberCharacter.name || '').trim().toLowerCase() === speaker) {
                candidate = memberCharacter;
                break;
            }
        }
    } else if (conv) {
        candidate = conv.character || null;
    }

    var registered = getImageGenerationRegisteredCharacter(
        candidate && candidate.name || message && message.speaker
    );
    return registered || candidate;
}

function getImageGenerationReferenceDescriptor(conv, message) {
    var messageCharacter = getImageGenerationMessageCharacter(conv, message);
    var registered = getImageGenerationRegisteredCharacter(messageCharacter && messageCharacter.name);
    var source = String(
        registered && (registered.previewImage || registered.avatar)
            || messageCharacter && (messageCharacter.previewImage || messageCharacter.avatar)
            || ''
    ).trim();
    return {
        character: registered || messageCharacter || null,
        source: source,
        name: String(registered && registered.name || messageCharacter && messageCharacter.name || '').trim()
    };
}

function cleanImageGenerationPromptText(value) {
    return String(value || '')
        .replace(/<details\b[\s\S]*?<\/details>/gi, ' ')
        .replace(/<details\b[^>]*>[\s\S]*$/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeImageGenerationPromptWhitespace(value) {
    return String(value || '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function appendImageGenerationStylePrompt(summary, stylePrompt) {
    var scene = cleanImageGenerationPromptText(summary);
    var style = cleanImageGenerationPromptText(stylePrompt).slice(0, 1000);
    if (!style) return scene.slice(0, 5000);
    var separator = '\n\n风格要求：';
    var sceneLimit = Math.max(1, 5000 - separator.length - style.length);
    return normalizeImageGenerationPromptWhitespace(scene.slice(0, sceneLimit) + separator + style).slice(0, 5000);
}
