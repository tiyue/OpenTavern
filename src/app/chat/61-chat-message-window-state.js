/**
 * 新手导读（文件：61-chat-message-window-state.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、窗口、状态”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `getRenderableChatMessages(conv)`、`clearMessageContainerAfterConversationSwitch(container, conv)`、`getChatMessageWindowState(conv, allMessages)`、`canIncrementalRenderChatMessages(windowState)`、`setChatMessageEmptyStateVisible(visible)`、`renderChatMessageEmptyState(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Message Window State ====================
const DEFAULT_CHAT_HISTORY_WINDOW = 150;

// 每个会话登记当前窗口内的消息节点与显示签名；只保存在运行时，不写入用户快照。
var chatMessageRenderRegistry = new WeakMap();
// 记录消息容器当前渲染的会话 ID，只有真正切换会话时才清空容器。
var chatMessageRenderedConvId = null;

function getRenderableChatMessages(conv) {
    return conv && Array.isArray(conv.messages)
        ? conv.messages.filter(function(m) { return m.role !== 'system'; })
        : [];
}

function getChatMessageRenderRegistry(conv) {
    var registry = chatMessageRenderRegistry.get(conv);
    if (!registry) {
        registry = { rows: new Map() };
        chatMessageRenderRegistry.set(conv, registry);
    }
    return registry;
}

function clearMessageContainerAfterConversationSwitch(container, conv) {
    if (chatMessageRenderedConvId === conv.id) return;
    chatMessageRenderedConvId = conv.id;
    while (container.firstChild) container.removeChild(container.firstChild);
}

function getChatMessageWindowState(conv, allMessages) {
    var historyWindow = conv._historyWindow || DEFAULT_CHAT_HISTORY_WINDOW;
    var showAll = !!conv._showAllMessages;
    if (showAll) historyWindow = Infinity;

    var startIdx = Math.max(0, allMessages.length - historyWindow);
    var visibleMessages = allMessages.slice(startIdx);
    var lastRenderedCount = conv._lastRenderedVisibleCount || 0;
    var currentVisibleCount = visibleMessages.length;

    return {
        showAll: showAll,
        startIdx: startIdx,
        visibleMessages: visibleMessages,
        lastRenderedCount: lastRenderedCount,
        currentVisibleCount: currentVisibleCount
    };
}

function canIncrementalRenderChatMessages(windowState) {
    return windowState.currentVisibleCount > windowState.lastRenderedCount &&
        !state.isGenerating &&
        !windowState.showAll;
}

function setChatMessageEmptyStateVisible(visible) {
    if (dom.emptyState) dom.emptyState.style.display = visible ? '' : 'none';
    if (dom.tokenInfo) dom.tokenInfo.classList.toggle('hidden', !!visible);
}

function renderChatMessageEmptyState(container) {
    container.innerHTML = '';
    setChatMessageEmptyStateVisible(true);
}

function findFirstNonSystemMessageIndex(conv) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].role !== 'system') return i;
    }
    return -1;
}

function stringifyChatMessageStamp(value) {
    if (typeof value === 'undefined') return '';
    try { return JSON.stringify(value) || ''; } catch (e) { return String(value); }
}

function canonicalChatMessageMvuValue(value) {
    if (typeof canonicalMvuRuntimeValue === 'function') {
        var canonical = canonicalMvuRuntimeValue(value);
        return typeof canonical === 'string' ? canonical : stringifyChatMessageStamp(canonical);
    }
    return stringifyChatMessageStamp(value);
}

// 只有使用声明式模板 / MVU 控制块 / 变量宏或带人工覆盖的消息，显示才随 MVU 变量变化。
var CHAT_MESSAGE_MVU_TEMPLATE_PATTERN = /<%|<(?:initvar|UpdateVariable|JSONPatch|json_patch)\b|\{\{\s*(?:getvar|get_message_variable|format_message_variable)\s*::/i;

function chatMessageUsesMvuDisplay(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(msg, 'mvuManualData')) return true;
    return CHAT_MESSAGE_MVU_TEMPLATE_PATTERN.test(String(msg.content || '') + '\n' + String(msg.cot || ''));
}

// 该消息显示时实际读取的 MVU 数据；只有模板消息才计算，普通正文编辑不会牵动后继行。
// cache 以 MVU 上下文戳为键在单次渲染内复用，避免重复回放。
function getChatMessageMvuDisplayStamp(conv, msg, cache) {
    if (!chatMessageUsesMvuDisplay(msg) || typeof getMvuDataForMessage !== 'function') return '';
    var cacheKey = msg && msg.id != null ? msg.id : null;
    if (cache && cacheKey !== null && cache.has(cacheKey)) return cache.get(cacheKey);
    var value = canonicalChatMessageMvuValue(getMvuDataForMessage(conv, msg));
    if (cache && cacheKey !== null) cache.set(cacheKey, value);
    return value;
}

function getChatMessageManualMvuStamp(msg) {
    if (!msg || !Object.prototype.hasOwnProperty.call(msg, 'mvuManualData')) return '';
    return canonicalChatMessageMvuValue(msg.mvuManualData);
}

// 会话级显示设置：只取真正影响行 HTML 的字段，API 凭据/云同步/缓存状态不参与。
function getChatMessageDisplaySettingsStamp() {
    var settings = (typeof state !== 'undefined' && state && state.settings) || {};
    var preset = settings.sillyTavernPreset || {};
    return stringifyChatMessageStamp({
        lang: settings.lang || '',
        userName: settings.userName || '',
        userDescription: settings.userDescription || '',
        showCotEnabled: settings.showCotEnabled !== false,
        showMsgTokenUsage: settings.showMsgTokenUsage === true,
        showReplyAvatar: settings.showReplyAvatar === true,
        globalRegexEnabled: settings.globalRegexEnabled === true,
        globalRegexScripts: settings.globalRegexEnabled === true ? settings.globalRegexScripts || null : null,
        presetRegexEnabled: preset.regexScriptsEnabled === true,
        presetRegexScripts: preset.regexScriptsEnabled === true ? preset.regexScripts || null : null
    });
}

// 会话级显示依赖：主题、影响显示的设置以及角色/群成员发言信息。
function getChatMessageConversationStamp(conv) {
    var theme = typeof document !== 'undefined' && document.body ? document.body.className : '';
    return [
        theme,
        getChatMessageDisplaySettingsStamp(),
        stringifyChatMessageStamp(conv && conv.character || null),
        stringifyChatMessageStamp(conv && conv.group || null)
    ].join('\u0001');
}

function getChatMessageResponseVersionKey(msg) {
    var versions = typeof getResponseVersions === 'function' ? getResponseVersions(msg) : [];
    var key = String(versions.length);
    for (var i = 0; i < versions.length; i++) {
        key += '\u0003' + String(versions[i].id) + (versions[i].interrupted ? '!' : '');
    }
    return key;
}

// 消息用量元数据：只取 token 徽标实际显示的字段。
function getChatMessageUsageStamp(msg) {
    var usage = msg && msg.usage;
    if (!usage || typeof usage !== 'object') return '';
    return stringifyChatMessageStamp([
        Number(usage.promptTokens) || 0,
        Number(usage.completionTokens) || 0,
        Number(usage.cachedTokens) || 0,
        Number(usage.tokensPerSecond) || 0
    ]);
}

// 正则正文与思考链异步完成时原文不变；复用现有规则签名，并把链的就绪状态纳入该行依赖。
function getChatMessageRegexStamp(msg, conv) {
    if (typeof collectRegexDisplaySteps !== 'function' || typeof buildRegexDisplaySignature !== 'function' ||
        typeof getRegexDisplayChainState !== 'function') return '';
    var settings = state.settings || {};
    var character = typeof getMessageSpeakerCharacter === 'function' ? getMessageSpeakerCharacter(msg, conv) : conv.character;
    var info = { settings: settings, charName: character && character.name || 'Assistant', userName: settings.userName || 'User' };
    var inputs = [{ text: msg.content, placement: msg.role === 'user' ? 1 : 2 }];
    if (msg.cot && settings.showCotEnabled !== false) inputs.push({ text: msg.cot, placement: 6 });
    return inputs.map(function(input) {
        var context = { conv: conv, msg: msg, character: character, processingPhase: 'display', isEdit: !!msg.editedAt };
        var steps = collectRegexDisplaySteps(character, context, input.placement);
        if (!steps.length) return '';
        var signature = buildRegexDisplaySignature(input.text, steps, input.placement, info, context);
        var chain = getRegexDisplayChainState(context, input.placement, false);
        return fingerprintMessageText(signature) + ':' + (chain ? chain.token + ':' + chain.status : 'idle');
    }).join('|');
}

// 行内容指纹：正文修订/附件/思考、选中回复版本与中断标记、token 元数据、
// 人工 MVU 覆盖数据，以及模板消息实际读取的 MVU 变量值。
function getChatMessageContentStamp(msg, conv, mvuCache) {
    return [
        typeof getMessageRevision === 'function' ? getMessageRevision(msg) : '',
        String(msg && msg.selectedResponseVersionId || ''),
        getChatMessageResponseVersionKey(msg),
        msg && msg.interrupted === true ? '1' : '0',
        getChatMessageManualMvuStamp(msg),
        String(msg && msg.mvuManualVersionId || ''),
        msg && msg.mvuManualSwipeId != null ? String(msg.mvuManualSwipeId) : '',
        getChatMessageUsageStamp(msg),
        getChatMessageRegexStamp(msg, conv),
        getChatMessageMvuDisplayStamp(conv, msg, mvuCache)
    ].join('\u0002');
}

// 行外观指纹：发送者、头像、开场按钮位置、图片消息与全局显示戳。
// 续写按钮等按行状态改为原地补丁，避免普通滑动/新消息导致整行重建。
function getChatMessageRowSignature(msg, conv, isFirstNonSystem, conversationStamp) {
    var senderName = typeof getMessageSenderName === 'function' ? getMessageSenderName(msg, conv) : '';
    var character = typeof getMessageSpeakerCharacter === 'function' ? getMessageSpeakerCharacter(msg, conv) : null;
    var avatar = typeof getMessageAvatarSource === 'function' ? getMessageAvatarSource(character) : '';
    var imageOnly = typeof isImageAttachmentOnlyMessage === 'function' ? !!isImageAttachmentOnlyMessage(msg) : false;
    return [
        String(msg && msg.id || ''),
        msg && msg.role || '',
        senderName,
        avatar,
        character && character.name || '',
        imageOnly ? '1' : '0',
        isFirstNonSystem ? '1' : '0',
        conversationStamp
    ].join('\u0004');
}

// 完成回复时直接插入的行也登记签名，使下一次窗口渲染可以复用同一节点。
function registerRenderedChatMessageRow(conv, msg, node) {
    if (!conv || !msg || !msg.id || !node) return;
    var registry = getChatMessageRenderRegistry(conv);
    var messageIndex = (conv.messages || []).indexOf(msg);
    registry.rows.set(msg.id, {
        node: node,
        signature: getChatMessageRowSignature(msg, conv, messageIndex === findFirstNonSystemMessageIndex(conv), getChatMessageConversationStamp(conv)),
        contentStamp: getChatMessageContentStamp(msg, conv),
        index: messageIndex
    });
}
