function defaultConversation() {
    return {
        id: makeId(),
        title: 'New Chat',
        character: null,          // 单角色模式（向后兼容）
        messages: [],
        summaries: [],
        worldInfo: null,          // LEGACY
        // Phase 2+ world books（支持角色卡内嵌 character_book 自动导入）
        worldBookIds: [],

        // ===== 群组聊天（Group Chat）新增字段 - Stage 1 MVP =====
        // 当 group 存在且 members.length >= 2 时，进入群组模式
        group: null,              // { id, name, members: [{character, muted, order}], replyStrategy, generationMode, ... }

        created: Date.now(),
        updated: Date.now()
    };
}

function buildGroupSystemPrompt(conv, wiByPos) {
    if (!isGroupChat(conv)) {
        return buildSystemPrompt(conv.character, wiByPos);
    }

    const members = getGroupMembers(conv);
    const forcedSpeaker = conv._forcedSpeaker || getCurrentSpeakerCharacter(conv);
    const userName = state.settings.userName || 'User';
    const lang = state.settings.lang || 'zh-CN';

    let parts = [];

    // 首先尊重用户在设置中填写的自定义系统提示词
    var customSysPrompt = state.settings.systemPrompt;
    if (customSysPrompt && customSysPrompt.trim()) {
        parts.push(replacePlaceholders(customSysPrompt.trim(), 'Assistant', userName));
    }

    // Inject user description / persona (user's own setting) - also in group chats
    var userDesc = state.settings.userDescription || '';
    if (userDesc && userDesc.trim()) {
        parts.push('User\'s Persona: ' + replacePlaceholders(userDesc.trim(), 'Assistant', userName));
    }

    // ========== 群组多角色严格指令（放在自定义提示词之后） ==========
    let groupInstruction = '';
    if (lang === 'zh-TW') {
        groupInstruction = `你正在進行一個多角色群組對話。以下是本群組中所有角色的**完整、未經刪減**的角色資料。你必須嚴格按照每個角色提供的完整資料進行扮演，絕對不能混淆任何角色的性格、背景、說話方式或知識。

**嚴格規則：**
- 每個角色都有自己獨立且完整的設定，請嚴格遵守。
- 當用戶訊息中包含 @角色名（例如 @普拉娜）時，被提及的角色應該是本輪的主要回應者。
- 沒有 @ 時，你可以根據上下文自然決定由誰發言，但仍必須嚴格保持每個角色的獨立性。
- 絕對不要將不同角色的特質混在一起。`;
    } else if (lang === 'en') {
        groupInstruction = `You are roleplaying in a multi-character group chat. Below are the **complete, unedited** profiles of all characters currently in this group. You MUST strictly role-play each character according to their full provided information. Do not mix personalities, backgrounds, speech patterns, or knowledge between characters under any circumstances.

**Strict Rules:**
- Each character has their own independent and complete setting — adhere to them rigorously.
- When the user's message contains @CharacterName (e.g. @普拉娜), the mentioned character should be the primary responder this turn.
- If there is no @, you may naturally decide who speaks based on context, but you must still maintain each character's distinct identity.
- Never blend traits from different characters.`;
    } else {
        groupInstruction = `你正在进行一个多角色群组对话。以下是本群组中所有角色的**完整、未经删减**的角色资料。你必须严格按照每个角色提供的完整资料进行扮演，绝对不能混淆任何角色的性格、背景、说话方式或知识。

**严格规则：**
- 每个角色都有自己独立且完整的设定，请严格遵守。
- 当用户消息中包含 @角色名（例如 @普拉娜）时，被提及的角色应该是本轮的主要回应者。
- 没有 @ 时，你可以根据上下文自然决定由谁发言，但仍必须严格保持每个角色的独立性。
- 绝对不要将不同角色的特质混在一起。`;
    }
    parts.push(groupInstruction);

    // 群组场景覆盖
    if (conv.group.scenarioOverride && conv.group.scenarioOverride.trim()) {
        parts.push(replacePlaceholders(conv.group.scenarioOverride, forcedSpeaker ? forcedSpeaker.name : 'Assistant', userName));
    }

    // ========== 完整注入所有角色信息（强制默认行为） ==========
    if (members.length > 0) {
        parts.push('\n=== 群组角色完整资料（以下所有角色信息必须严格遵守） ===\n');

        members.forEach((member, index) => {
            const c = member.character;
            const charName = c.name || `角色${index + 1}`;
            let charBlock = `=== ${charName} ===\n`;

            if (c.system_prompt) charBlock += `System Prompt: ${replacePlaceholders(c.system_prompt, charName, userName)}\n\n`;
            const postHistory = getEffectivePostHistoryInstructions(c);
            if (postHistory) charBlock += `Post-History Instructions: ${replacePlaceholders(postHistory, charName, userName)}\n\n`;
            if (c.personality) charBlock += `Personality: ${replacePlaceholders(c.personality, charName, userName)}\n\n`;
            if (c.scenario) charBlock += `Scenario: ${replacePlaceholders(c.scenario, charName, userName)}\n\n`;
            if (c.description) charBlock += `Description: ${replacePlaceholders(c.description, charName, userName)}\n\n`;
            if (c.mes_example) charBlock += `Example Dialogues:\n${replacePlaceholders(c.mes_example, charName, userName)}\n\n`;
            if (c.creator_notes) charBlock += `Creator Notes: ${c.creator_notes}\n\n`;

            parts.push(charBlock.trim());
        });
    }

    // 明确标注当前被 @ 的角色（如果有）—— 加强指令以提高模型遵守率
    if (forcedSpeaker) {
        const fsName = forcedSpeaker.name;
        parts.push(`\n【本轮用户特别指定】用户在本条消息中明确 @ 了 ${fsName}。**本轮回复必须以 ${fsName} 为主角/主要发言者**：场景描述、动作、对话和内心活动应主要围绕 ${fsName} 展开，或让 ${fsName} 首先/主要回应用户。其他角色可以作为配角出现、评论或互动，但不能抢夺本轮的主要叙述焦点和第一人称/第三人称主视角。严格遵守本轮由 ${fsName} 驱动回复。`);
    }

    // World Info
    if (wiByPos) {
        parts = injectWorldInfoIntoSystem(parts, wiByPos, forcedSpeaker ? forcedSpeaker.name : 'Assistant', userName);
    }

    return parts.join('\n\n').trim();
}
