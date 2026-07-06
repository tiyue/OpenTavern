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
