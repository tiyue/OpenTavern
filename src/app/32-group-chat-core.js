// ==================== Group Chat Core Helpers ====================
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

