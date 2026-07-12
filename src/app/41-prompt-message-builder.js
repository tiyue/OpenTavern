/**
 * 新手导读（文件：41-prompt-message-builder.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“提示词、消息、构建器”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `buildMessagesForAPI(无参数)`、`formatPromptMessages(messages)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// API 消息构建主流程：合并角色、摘要、世界书、历史记录和预设提示词。
/**
 * 生成最终发送给大模型的 messages 数组。
 *
 * 输入：无。它从当前会话、全局设置、角色资料、世界书和预设中读取数据。
 * 返回：形如 [{ role: 'system', content: '...' }, ...] 的新数组，不直接修改聊天历史。
 *
 * 组装顺序非常重要：
 * 1. 先确定单聊/群聊身份，并激活当前应生效的世界书条目。
 * 2. 创建 system 提示词，再插入预设中要求位于聊天历史之前的消息。
 * 3. 加入历史总结与尚未被总结覆盖的真实聊天记录。
 * 4. 加入历史之后的预设，并按“深度”插入世界书或预设消息。
 * 5. 解析 outlet 占位符，最后统一替换角色名和用户名占位符。
 *
 * 调试模型行为时，formatPromptMessages() 可以把数组转换为便于人阅读的分段文本。
 */
function buildMessagesForAPI() {
    var conv = getActiveConv();
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = state.settings.userName || 'User';
    var maxMsgs = state.settings.contextLength;

    var wiResult = getActivatedWorldInfo(conv);
    var wiByPos = wiResult.byPosition || {};
    var systemContent = isGroup
        ? buildGroupSystemPrompt(conv, wiByPos)
        : buildSystemPrompt(conv.character, wiByPos);

    var apiMessages = [];
    var presetBuckets = buildSillyTavernPresetMessageBuckets(charName, userName);
    var finalSystemContent = systemContent || '';

    if (finalSystemContent) {
        apiMessages.push({ role: 'system', content: finalSystemContent });
    }

    if (presetBuckets.beforeHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.beforeHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    var summaryMessage = buildPromptSummaryMessage(conv.summaries, state.settings.lang || 'zh-CN');
    if (summaryMessage) apiMessages.push(summaryMessage);

    apiMessages = apiMessages.concat(getRegularPromptMessages(conv, maxMsgs));

    if (presetBuckets.afterHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.afterHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    var depthEntries = wiByPos[WI_POS.AT_DEPTH] || [];
    insertMessagesAtDepth(apiMessages, depthEntries, charName, userName);
    insertMessagesAtDepth(apiMessages, presetBuckets.inChat, charName, userName);

    resolvePromptOutletPlaceholders(apiMessages, wiResult.outlets || {}, charName, userName);
    return replacePromptMessagePlaceholders(apiMessages, charName, userName);
}

function formatPromptMessages(messages) {
    var text = '';
    for (var i = 0; i < messages.length; i++) {
        var role = String(messages[i].role || '').toUpperCase();
        var content = messages[i].content || '';
        if (content) {
            text += '=== ' + role + ' ===\n';
            text += content + '\n\n';
        }
    }
    return text;
}
