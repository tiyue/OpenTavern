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
// 默认二阶段提示词只描述“输出什么”，所以这里补一条明确的 user 请求，避免模型把正文继续当成 dream 正文续写。
var DEFAULT_SECOND_STAGE_OPTIONS_REQUEST = [
    '请只依据本轮刚刚生成的正文，生成 2-4 个下一步行动选项。',
    '不要续写正文，不要输出 dream 包装、前言或解释，只输出以下 XML 结构：',
    '<options>',
    '  <option>',
    '    <title>2-5字短标题</title>',
    '    <description>25-55字的行动导向描述</description>',
    '  </option>',
    '</options>'
].join('\n');

// 默认提示词下，模型返回了文本但没有完整有效选项时，追加一次格式纠正请求（不发送无效回复）。
var DEFAULT_SECOND_STAGE_OPTIONS_RETRY = [
    '上一次输出格式无效：没有包含完整的 <options> 结构。',
    '请严格只输出符合要求的 <options> XML（2-4 个 option，每个包含 title 与 description），不要续写正文或输出其他内容。'
].join('\n');

function buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName, settings) {
    settings = settings || state.settings;
    var messages = [];
    var previousMain = findPreviousMainAssistantMessage(conv, firstStageMessage);
    var previousSecond = findLinkedSecondStageMessage(conv, previousMain);
    var currentUser = findLatestUserMessageBefore(conv, firstStageMessage);

    if (previousMain && previousMain.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮正文]\n' + replacePlaceholders(previousMain.content || '', charName, userName, { conv: conv, message: previousMain, sourceMessage: previousMain, settings: settings, processingPhase: 'second_stage' })
        });
    }
    if (previousSecond && previousSecond.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮第二阶段输出]\n' + replacePlaceholders(previousSecond.content || '', charName, userName, { conv: conv, message: previousSecond, sourceMessage: previousSecond, settings: settings, processingPhase: 'second_stage' })
        });
    }
    if (currentUser && currentUser.content) {
        messages.push({
            role: 'user',
            content: '[当前用户消息]\n' + replacePlaceholders(currentUser.content || '', charName, userName, { conv: conv, message: currentUser, sourceMessage: currentUser, settings: settings, processingPhase: 'second_stage' })
        });
    }
    if (firstStageMessage && firstStageMessage.content) {
        messages.push({
            role: 'assistant',
            content: '[本轮刚生成的正文]\n' + replacePlaceholders(firstStageMessage.content || '', charName, userName, { conv: conv, message: firstStageMessage, sourceMessage: firstStageMessage, settings: settings, processingPhase: 'second_stage' })
        });
    }

    return messages;
}

function buildMessagesForSecondStage(firstStageMessage, conversation, settings) {
    var conv = conversation || getActiveConv();
    settings = settings || state.settings;
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = settings.userName || 'User';

    var secondPrompt = (settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var isDefaultPrompt = secondPrompt === String(DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var apiMessages = [];
    if (secondPrompt) {
        apiMessages.push({ role: 'system', content: replacePlaceholders(secondPrompt, charName, userName, { conv: conv, settings: settings, processingPhase: 'second_stage' }) });
    }

    if (settings.twoStageIncludeRecentContext) {
        var recentMessages = buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName, settings);
        // 默认提示词在最近上下文后补上明确的 user 请求；自定义提示词保持原样。
        if (isDefaultPrompt) recentMessages.push({ role: 'user', content: DEFAULT_SECOND_STAGE_OPTIONS_REQUEST });
        return apiMessages.concat(recentMessages);
    }

    if (firstStageMessage && firstStageMessage.content) {
        apiMessages.push({
            role: 'assistant',
            content: replacePlaceholders(firstStageMessage.content || '', charName, userName, { conv: conv, message: firstStageMessage, sourceMessage: firstStageMessage, settings: settings, processingPhase: 'second_stage' })
        });
    }
    if (isDefaultPrompt) apiMessages.push({ role: 'user', content: DEFAULT_SECOND_STAGE_OPTIONS_REQUEST });

    return apiMessages;
}

// 默认提示词的格式纠正请求：沿用原本上下文与明确指令，只追加一条“上次格式无效”的 user 提醒。
function buildSecondStageCorrectionMessages(messages) {
    return (Array.isArray(messages) ? messages : []).concat([{ role: 'user', content: DEFAULT_SECOND_STAGE_OPTIONS_RETRY }]);
}
