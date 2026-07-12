/**
 * 新手导读（文件：32-conversation-model.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“会话、数据模型”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `defaultConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
// 会话数据模型：创建新聊天所需的默认字段和运行时初始状态。
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
