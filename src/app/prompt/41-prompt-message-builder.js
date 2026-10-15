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
function* buildPromptMessageSteps(conv, macroEnv, settings) {
    settings = settings || state.settings;
    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = settings.userName || 'User';
    var maxMsgs = settings.contextLength;
        var wiResult = getActivatedWorldInfo(conv);
        var wiByPos = yield { groups: wiResult.byPosition || {}, character: currentChar };
        var wiOutlets = yield { groups: wiResult.outlets || {}, character: currentChar };
        var systemWI = Object.assign({}, wiByPos);
        var note = getEffectiveAuthorNote(conv);
        if (note.enabled === true && String(note.content || '').trim()) {
            systemWI[WI_POS.TOP_AN] = [];
            systemWI[WI_POS.BOTTOM_AN] = [];
        }
        var systemContent = isGroup
            ? buildGroupSystemPrompt(conv, systemWI)
            : buildSystemPrompt(conv.character, systemWI);

        var apiMessages = [];
        var presetBuckets = buildSillyTavernPresetMessageBuckets(charName, userName);
        if (systemContent) apiMessages.push({ role: 'system', content: systemContent });

        if (presetBuckets.beforeHistory.length > 0) {
            apiMessages = apiMessages.concat(presetBuckets.beforeHistory.map(function(message) {
                return { role: message.role, content: message.content };
            }));
        }

        var summaryMessage = buildPromptSummaryMessage(getValidConversationSummaries(conv), settings.lang || 'zh-CN');
        if (summaryMessage) apiMessages.push(summaryMessage);
        apiMessages = apiMessages.concat(getRegularPromptMessages(conv, maxMsgs));

        if (presetBuckets.afterHistory.length > 0) {
            apiMessages = apiMessages.concat(presetBuckets.afterHistory.map(function(message) {
                return { role: message.role, content: message.content };
            }));
        }

        var depthEntries = wiByPos[WI_POS.AT_DEPTH] || [];
        insertMessagesAtDepth(apiMessages, depthEntries, charName, userName);
        insertMessagesAtDepth(apiMessages, presetBuckets.inChat, charName, userName);
        insertAdditionalPromptMessages(apiMessages, conv, currentChar, wiByPos, charName, userName, settings);
        resolvePromptOutletPlaceholders(apiMessages, wiOutlets, charName, userName);

        var promptDepths = {};
        var promptDepth = 0;
        for (var index = apiMessages.length - 1; index >= 0; index--) {
            var role = String(apiMessages[index] && apiMessages[index].role || '').toLowerCase();
            if (role === 'user' || role === 'assistant') promptDepths[index] = promptDepth++;
        }

        var result = [];
        for (var index = 0; index < apiMessages.length; index++) {
            var message = apiMessages[index];
            var role = String(message.role || '').toLowerCase();
            var content = message.content;
            var source = message.__promptSource || null;
            var sourceMessage = source && source.message;
            var historySnapshot = source ? getMvuDataForMessage(conv, sourceMessage) : null;
            if (Object.prototype.hasOwnProperty.call(promptDepths, index) && typeof formatMessage === 'function') {
                content = yield { text: content, context: {
                    conv: conv,
                    character: currentChar,
                    message: sourceMessage,
                    sourceMessage: sourceMessage,
                    sourceId: source && source.id,
                    sourceRevision: source && source.revision,
                    historySnapshot: historySnapshot,
                    forPrompt: true,
                    processingPhase: 'prompt',
                    sourcePlacement: role === 'user' ? 'USER_INPUT' : 'AI_OUTPUT',
                    messageRole: role,
                    depth: promptDepths[index], macroEnv: macroEnv, allowStVarMutations: true,
                    settings: settings
                } };
            }
            var replacementExtras = {
                conv: conv,
                message: sourceMessage,
                sourceMessage: sourceMessage,
                sourceId: source && source.id,
                sourceRevision: source && source.revision,
                historySnapshot: historySnapshot,
                macroEnv: macroEnv,
                settings: settings,
                processingPhase: 'prompt',
                depth: promptDepths[index]
            };
            if (source) replacementExtras.mvuData = historySnapshot;
            result.push({
                role: message.role,
                content: replacePlaceholders(content, charName, userName, replacementExtras)
            });
        }
        return result;
}

function capturePromptBuildSource(conv) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    return {
        conversation: conv || null,
        conversationId: conv && conv.id,
        live: typeof isLiveConversation !== 'function' || isLiveConversation(conv),
        messages: messages.map(function(message) {
            return {
                id: message && message.id,
                revision: typeof getMessageRevision === 'function' ? getMessageRevision(message) : JSON.stringify(message)
            };
        })
    };
}

function isPromptBuildSourceCurrent(source) {
    if (!source) return true;
    var conv = source.conversation;
    if (!conv || conv.id !== source.conversationId) return false;
    if (source.live && typeof isLiveConversation === 'function' && !isLiveConversation(conv)) return false;
    var messages = Array.isArray(conv.messages) ? conv.messages : [];
    if (messages.length !== source.messages.length) return false;
    return source.messages.every(function(message, index) {
        var current = messages[index] || {};
        var revision = typeof getMessageRevision === 'function' ? getMessageRevision(current) : JSON.stringify(current);
        return current.id === message.id && revision === message.revision;
    });
}

function isPromptBuildCurrent(build) {
    if (build.operation && typeof build.operation.isCurrent === 'function' && !build.operation.isCurrent()) return false;
    return isPromptBuildSourceCurrent(build.source);
}

function createPromptBuild(conversation, options) {
    options = options || {};
    var conv = conversation || getActiveConv();
    if (options.preview) conv = JSON.parse(JSON.stringify(conv));
    normalizeConversation(conv);
    var character = isGroupChat(conv) ? getCurrentSpeakerCharacter(conv) : conv.character;
    var build = {
        conv: conv,
        source: capturePromptBuildSource(conv),
        settings: options.settings || JSON.parse(JSON.stringify(state.settings)),
        operation: options.operation || null
    };
    if (build.operation && typeof build.operation.setSource === 'function') build.operation.setSource(build.source);
    build.env = createSillyTavernMacroEnv(conv, {
        charName: character && character.name || 'Assistant', historyMessages: conv.messages, persist: !options.preview,
        persistCheck: function() { return isPromptBuildCurrent(build); }
    });
    build.iterator = buildPromptMessageSteps(conv, build.env, build.settings);
    return build;
}

function advancePromptBuild(build, value) {
    var previous = activateSillyTavernMacroEnv(build.env, true);
    var liveSettings = state.settings;
    state.settings = build.settings;
    try { return build.iterator.next(value); } finally { state.settings = liveSettings; restoreSillyTavernMacroEnv(previous); }
}

function buildMessagesForAPI(conversation, options) {
    var build = createPromptBuild(conversation, options);
    var step = advancePromptBuild(build);
    while (!step.done) {
        var operation = step.value;
        var previous = activateSillyTavernMacroEnv(build.env, true);
        var value;
        try {
            value = operation.groups
                ? formatWorldInfoEntriesForPrompt(operation.groups, operation.character, build.conv)
                : formatMessage(operation.text, operation.context);
        } finally { restoreSillyTavernMacroEnv(previous); }
        step = advancePromptBuild(build, value);
    }
    persistSillyTavernMacroEnv(build.env);
    return step.value;
}

async function buildMessagesForAPIAsync(conversation, options) {
    var build = createPromptBuild(conversation, options);
    if (!isPromptBuildCurrent(build)) return null;
    var step = advancePromptBuild(build);
    while (!step.done) {
        if (!isPromptBuildCurrent(build)) return null;
        var operation = step.value;
        var value;
        if (operation.groups) {
            value = {};
            for (var key of Object.keys(operation.groups)) {
                value[key] = [];
                for (var entry of operation.groups[key]) {
                    if (!isPromptBuildCurrent(build)) return null;
                    var formattedEntry = await formatMessageAsync(entry.content || '', {
                        conv: build.conv, character: operation.character, forPrompt: true, processingPhase: 'prompt',
                        sourcePlacement: 'WORLD_INFO', depth: entry.depth, macroEnv: build.env, allowStVarMutations: true, settings: build.settings
                    });
                    if (!isPromptBuildCurrent(build)) return null;
                    value[key].push(Object.assign({}, entry, { content: formattedEntry }));
                }
            }
        } else {
            value = await formatMessageAsync(operation.text, Object.assign({}, operation.context, { settings: build.settings }));
            if (!isPromptBuildCurrent(build)) return null;
        }
        if (!isPromptBuildCurrent(build)) return null;
        step = advancePromptBuild(build, value);
    }
    if (!isPromptBuildCurrent(build)) return null;
    persistSillyTavernMacroEnv(build.env);
    if (!isPromptBuildCurrent(build)) return null;
    Object.defineProperty(step.value, '_requestSettings', { value: build.settings });
    Object.defineProperty(step.value, '_requestConversation', { value: build.conv });
    if (build.operation) Object.defineProperty(step.value, '_promptBuildOperation', { value: build.operation });
    return step.value;
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
