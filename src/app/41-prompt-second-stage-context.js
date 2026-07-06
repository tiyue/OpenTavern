// ==================== Second Stage Context Prompt ====================
function buildSecondStageContextPrompt(conv, worldInfoByPos, focusSpeakerName) {
    var parts = [];
    var isGroup = isGroupChat(conv);
    var userName = state.settings.userName || 'User';

    var userDesc = state.settings.userDescription || '';
    if (userDesc && userDesc.trim()) {
        parts.push('User\'s Persona: ' + replacePlaceholders(userDesc.trim(), 'Assistant', userName));
    }

    if (isGroup) {
        var members = getGroupMembers(conv);
        var forcedSpeaker = null;
        if (focusSpeakerName) {
            var lowerFocus = String(focusSpeakerName).toLowerCase();
            var matched = members.find(function(m) {
                return m.character && String(m.character.name || '').toLowerCase() === lowerFocus;
            });
            if (matched) forcedSpeaker = matched.character;
        }
        forcedSpeaker = forcedSpeaker || conv._nextGroupSpeaker || getCurrentSpeakerCharacter(conv);
        parts.push('这是一个多角色群组对话。第二阶段选项必须尊重每个角色的独立性格、当前主要发言者，以及群聊中的关系动态。');
        if (conv.group && conv.group.scenarioOverride && conv.group.scenarioOverride.trim()) {
            parts.push(replacePlaceholders(conv.group.scenarioOverride, forcedSpeaker ? forcedSpeaker.name : 'Assistant', userName));
        }
        members.forEach(function(member, index) {
            var c = member.character || {};
            var charName = c.name || ('角色' + (index + 1));
            var charBlock = '=== ' + charName + ' ===\n';
            if (c.system_prompt) charBlock += 'System Prompt: ' + replacePlaceholders(c.system_prompt, charName, userName) + '\n\n';
            var postHistory = getEffectivePostHistoryInstructions(c, 'second');
            if (postHistory) charBlock += 'Post-History Instructions: ' + replacePlaceholders(postHistory, charName, userName) + '\n\n';
            if (c.personality) charBlock += 'Personality: ' + replacePlaceholders(c.personality, charName, userName) + '\n\n';
            if (c.scenario) charBlock += 'Scenario: ' + replacePlaceholders(c.scenario, charName, userName) + '\n\n';
            if (c.description) charBlock += 'Description: ' + replacePlaceholders(c.description, charName, userName) + '\n\n';
            if (c.mes_example) charBlock += 'Example Dialogues:\n' + replacePlaceholders(c.mes_example, charName, userName) + '\n\n';
            parts.push(charBlock.trim());
        });
        if (forcedSpeaker && forcedSpeaker.name) {
            parts.push('本轮正文的主要发言者/叙事焦点：' + forcedSpeaker.name);
        }
    } else {
        var character = conv.character;
        var charName = character ? character.name : 'Assistant';
        if (character) {
            var charInfo = [];
            if (character.system_prompt) charInfo.push('System Prompt: ' + replacePlaceholders(character.system_prompt, charName, userName));
            var postHistory = getEffectivePostHistoryInstructions(character, 'second');
            if (postHistory) charInfo.push('Post-History Instructions: ' + replacePlaceholders(postHistory, charName, userName));
            if (character.personality) charInfo.push('Personality: ' + replacePlaceholders(character.personality, charName, userName));
            if (character.scenario) charInfo.push('Scenario: ' + replacePlaceholders(character.scenario, charName, userName));
            if (character.description) charInfo.push('Description: ' + replacePlaceholders(character.description, charName, userName));
            if (character.mes_example) charInfo.push('Example Dialogues:\n' + replacePlaceholders(character.mes_example, charName, userName));
            if (charInfo.length > 0) parts.push(charInfo.join('\n\n'));
        }
    }

    if (worldInfoByPos) {
        var currentChar = isGroup ? (forcedSpeaker || conv._nextGroupSpeaker || getCurrentSpeakerCharacter(conv)) : conv.character;
        var activeCharName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
        parts = injectWorldInfoIntoSystem(parts, worldInfoByPos, activeCharName, userName);
    }

    return parts.join('\n\n').trim();
}
