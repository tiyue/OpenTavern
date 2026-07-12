/**
 * 新手导读（文件：41-second-stage-prompt-builder.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“第二阶段、提示词、构建器”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName)`、`buildMessagesForSecondStage(firstStageMessage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// 二段生成提示词：整理上一轮、本轮正文和角色上下文供第二阶段使用。
function buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName) {
    var messages = [];
    var previousMain = findPreviousMainAssistantMessage(conv, firstStageMessage);
    var previousSecond = findLinkedSecondStageMessage(conv, previousMain);
    var currentUser = findLatestUserMessageBefore(conv, firstStageMessage);

    if (previousMain && previousMain.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮正文]\n' + replacePlaceholders(previousMain.content || '', charName, userName)
        });
    }
    if (previousSecond && previousSecond.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮第二阶段输出]\n' + replacePlaceholders(previousSecond.content || '', charName, userName)
        });
    }
    if (currentUser && currentUser.content) {
        messages.push({
            role: 'user',
            content: '[当前用户消息]\n' + replacePlaceholders(currentUser.content || '', charName, userName)
        });
    }
    if (firstStageMessage && firstStageMessage.content) {
        messages.push({
            role: 'assistant',
            content: '[本轮刚生成的正文]\n' + replacePlaceholders(firstStageMessage.content || '', charName, userName)
        });
    }

    return messages;
}

function buildMessagesForSecondStage(firstStageMessage) {
    var conv = getActiveConv();
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = state.settings.userName || 'User';

    var secondPrompt = (state.settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var apiMessages = [];
    if (secondPrompt) {
        apiMessages.push({ role: 'system', content: replacePlaceholders(secondPrompt, charName, userName) });
    }

    if (state.settings.twoStageIncludeRecentContext) {
        return apiMessages.concat(buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName));
    }

    if (firstStageMessage && firstStageMessage.content) {
        apiMessages.push({
            role: 'assistant',
            content: replacePlaceholders(firstStageMessage.content || '', charName, userName)
        });
    }

    return apiMessages;
}
