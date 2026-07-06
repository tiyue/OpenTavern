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

// ===== 群组聊天辅助函数（Stage 1 开始引入） =====
function isGroupChat(conv) {
    return !!(conv && conv.group && Array.isArray(conv.group.members) && conv.group.members.length >= 2);
}

function getGroupMembers(conv) {
    if (!conv || !conv.group || !Array.isArray(conv.group.members)) return [];
    return conv.group.members
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeConversation(conv) {
    if (!conv) return conv;

    // 确保群组字段存在（兼容旧数据）
    if (typeof conv.group === 'undefined') {
        conv.group = null;
    }

    // 轻量保证 members 有 order
    if (conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach((m, idx) => {
            if (typeof m.order !== 'number') m.order = idx;
            if (typeof m.muted !== 'boolean') m.muted = false;
        });
    }

    return conv;
}

// ===== 群组聊天消息渲染辅助 =====
function getNextGroupSpeaker(conv) {
    if (!isGroupChat(conv)) return null;

    const members = getGroupMembers(conv).filter(m => !m.muted);
    if (members.length === 0) return null;

    // 找到最后一条 assistant 消息的 speaker
    const lastAssistant = [...(conv.messages || [])].reverse().find(m =>
        m.role === 'assistant' && m.speaker
    );

    let lastIndex = -1;
    if (lastAssistant && lastAssistant.speaker) {
        const sp = lastAssistant.speaker;
        lastIndex = members.findIndex(m => m.character.name === sp);
        if (lastIndex === -1) {
            const lower = sp.toLowerCase();
            lastIndex = members.findIndex(m => (m.character.name || '').toLowerCase() === lower);
        }
    }

    // 下一个（循环）
    const nextIndex = (lastIndex + 1) % members.length;
    return members[nextIndex] ? members[nextIndex].character : members[0].character;
}

function getMessageSenderName(msg, conv) {
    if (!msg) return t('sender_assistant');

    if (msg.role === 'user') {
        return state.settings.userName || t('sender_you');
    }

    // 优先使用消息上记录的 speaker（群组聊天关键）
    if (msg.speaker) {
        return msg.speaker;
    }

    // 群组模式兜底
    if (isGroupChat(conv)) {
        // 如果消息没有 speaker，尝试从当前群组第一个成员取名
        const members = getGroupMembers(conv);
        if (members.length > 0) {
            return members[0].character.name;
        }
        return 'Assistant';
    }

    // 单角色模式
    return conv && conv.character ? conv.character.name : t('sender_assistant');
}

// ===== 群组聊天 Prompt 构建辅助（Stage 1 g6 开始） =====
function getCurrentSpeakerCharacter(conv) {
    if (!isGroupChat(conv)) return conv.character;

    // 最高优先级：本次生成前已经明确决定的发言者（sendMessage 里设置的）
    if (conv._nextGroupSpeaker) {
        return conv._nextGroupSpeaker;
    }

    // 没有预设时，主动计算“现在该谁说”（List Order）
    return getNextGroupSpeaker(conv);
}

// 获取当前正在生成（或即将生成）的发言者名字（优先用于消息附加和流式UI显示）
function getCurrentGeneratingSpeakerName(conv) {
    if (!isGroupChat(conv)) {
        return conv.character ? conv.character.name : t('sender_assistant');
    }

    if (conv._nextGroupSpeaker) {
        return conv._nextGroupSpeaker.name;
    }

    // 兜底：重新计算下一个
    const speakerChar = getNextGroupSpeaker(conv);
    return speakerChar ? speakerChar.name : 'Assistant';
}

// 解析用户输入中的 @提及（只取第一个有效提及，避免一次@多个角色导致混乱）
function parseGroupMention(text, conv) {
    if (!isGroupChat(conv) || !text) return null;

    // 只匹配第一个 @xxx
    const match = text.match(/@([^\s@，,。.!?]+)/);
    if (!match) return null;

    const mentionedName = match[1].trim();
    const members = getGroupMembers(conv);

    // 精确匹配或不区分大小写匹配
    let found = members.find(m => m.character.name === mentionedName);
    if (!found) {
        const lower = mentionedName.toLowerCase();
        found = members.find(m => m.character.name.toLowerCase() === lower);
    }

    return found ? found.character : null;
}

// 显示群组 @ 提及角色面板（手机端优化）
function showGroupMentionPanel(conv) {
    const modal = dom.groupMentionModal;
    const listContainer = dom.groupMentionList;
    if (!modal || !listContainer || !conv) return;

    listContainer.innerHTML = '';

    const members = getGroupMembers(conv);
    if (members.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-zinc-400 text-center py-6">当前群组没有成员</p>';
        modal.classList.remove('hidden');
        return;
    }

    members.forEach(member => {
        const char = member.character;
        const isMuted = member.muted;

        const item = document.createElement('div');
        item.className = `flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer active:bg-white/10 transition-colors ${isMuted ? 'opacity-60' : 'hover:bg-white/5'}`;

        const letter = char.name ? char.name.charAt(0).toUpperCase() : '?';
        const pSrc = char.previewImage || char.avatar;
        const avatarHTML = pSrc
            ? `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0"><img src="${escapeHtml(pSrc)}" class="w-full h-full object-cover" alt="${escapeHtml(char.name || '')}" onerror="this.parentNode.outerHTML='<div class=\\'w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0\\'>${letter}</div>'"></div>`
            : `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0">${letter}</div>`;

        item.innerHTML = `
            ${avatarHTML}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-zinc-100 text-sm sm:text-base truncate">${escapeHtml(char.name || '未命名')}</span>
                    ${isMuted ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">已静音</span>' : ''}
                </div>
                ${char.personality ? `<p class="text-[11px] sm:text-xs text-zinc-400 line-clamp-1 mt-0.5">${escapeHtml(char.personality.slice(0, 60))}</p>` : ''}
            </div>
        `;

        if (!isMuted) {
            item.addEventListener('click', () => {
                // 新逻辑：设置非编辑气泡，而不是往输入框插入纯文本 @名字
                setPendingGroupMention(char);
                modal.classList.add('hidden');

                // 聚焦输入框，让用户继续输入实际消息内容
                if (dom.messageInput) dom.messageInput.focus();
            });
        }

        listContainer.appendChild(item);
    });

    // 绑定关闭
    const close = () => modal.classList.add('hidden');
    dom.groupMentionCloseBtn.onclick = close;
    dom.groupMentionBackdrop.onclick = close;

    modal.classList.remove('hidden');
}

// ===== 新 @ 指定 UI 辅助：气泡而非文本插入（只能指定一个角色） =====
function setPendingGroupMention(char) {
    if (!char) return;
    pendingGroupMention = char;

    if (dom.mentionPill && dom.mentionPillName) {
        dom.mentionPill.classList.remove('hidden');
        dom.mentionPill.classList.add('flex');

        // 为手机端做紧凑显示：去掉英文括号部分 + 长度限制
        let display = char.name || '角色';
        if (display.includes('（')) {
            display = display.split('（')[0];
        }
        if (display.length > 5) {
            display = display.slice(0, 4) + '…';
        }
        dom.mentionPillName.textContent = '@' + display;

        // 工具提示显示完整名（hover / 长按可用）
        dom.mentionPill.title = char.name || '';
    }

    // 清理输入框里可能已有的旧 @ 文字（保持输入栏干净）
    if (dom.messageInput) {
        dom.messageInput.value = (dom.messageInput.value || '').replace(/@[^\s@，,。.!?]+/g, '').trim();
    }
}

function clearPendingGroupMention() {
    pendingGroupMention = null;
    if (dom.mentionPill) {
        dom.mentionPill.classList.remove('flex');
        dom.mentionPill.classList.add('hidden');
        if (dom.mentionPillName) {
            dom.mentionPillName.textContent = '';
            dom.mentionPill.title = '';
        }
    }
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
