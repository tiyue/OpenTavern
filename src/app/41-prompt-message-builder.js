function insertMessagesAtDepth(apiMessages, entries, charName, userName) {
    if (!entries || entries.length === 0) return apiMessages;
    entries.forEach(function(e) {
        var d = (e._depth != null) ? e._depth : (e.depth != null ? e.depth : 4);
        d = parseInt(d, 10);
        if (isNaN(d)) d = 0;
        var role = e.role;
        if (typeof role === 'number') role = (role === 0) ? 'system' : (role === 1 ? 'user' : 'assistant');
        role = normalizePromptRole(role || 'system');
        var content = replacePlaceholders(e.content || '', charName, userName);
        if (!content || !String(content).trim()) return;

        var insertIdx;
        if (d < 0) {
            // Negative depth: -1 = after the last message, -2 = before the last message, etc.
            insertIdx = apiMessages.length + (d + 1);
        } else {
            // Positive depth: 0 = after last, 1 = before last, etc. (from the end)
            insertIdx = apiMessages.length - d;
        }

        if (insertIdx < 1) insertIdx = 1;
        if (insertIdx > apiMessages.length) insertIdx = apiMessages.length;

        apiMessages.splice(insertIdx, 0, { role: role, content: content });
    });
    return apiMessages;
}

function buildMessagesForAPI() {
    var conv = getActiveConv();
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = state.settings.userName || 'User';
    var maxMsgs = state.settings.contextLength;

    // Activate World Info for this conversation
    var wiResult = getActivatedWorldInfo(conv);
    var wiByPos = wiResult.byPosition || {};

    // 群组模式使用新构建逻辑，单角色保持原有行为
    var systemContent = isGroup 
        ? buildGroupSystemPrompt(conv, wiByPos)
        : buildSystemPrompt(conv.character, wiByPos);

    var apiMessages = [];
    var presetBuckets = buildSillyTavernPresetMessageBuckets(charName, userName);

    // 不再自动注入内置角色扮演提示词；仅当用户在设置中手动填写/点击按钮填入后才作为自定义系统提示词发送。
    let finalSystemContent = systemContent || '';

    if (finalSystemContent) {
        apiMessages.push({ role: 'system', content: finalSystemContent });
    }

    if (presetBuckets.beforeHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.beforeHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    // Inject summaries as a second system message if any exist
    if (conv.summaries && conv.summaries.length > 0) {
        var summaryText = conv.summaries.map(function(s) { return s.text; }).join('\n---\n');
        var lang = state.settings.lang || 'zh-CN';
        var header = lang === 'zh-TW'
            ? '[以下是先前對話的自動摘要，供上下文參考]\n'
            : lang === 'en'
            ? '[Automatic summary of previous conversation for context]\n'
            : '[以下是先前对话的自动摘要，供上下文参考]\n';
        apiMessages.push({ role: 'system', content: header + summaryText });
    }

    // 【核心修复1 兼容增强】基于最后一个 summary 的 coveredEnd 向前裁剪
    // 1. 新总结会通过 performSummarization 物理移除消息（最优路径）
    // 2. 旧存档 / 未 prune 的对话也能立刻受益，不会把已总结的旧消息再塞进 prompt
    var regularMsgs = conv.messages.filter(function(m) {
        return m.role !== 'system' && String(m.content || '').trim();
    });
    var lastCovered = -1;
    if (conv.summaries && conv.summaries.length > 0) {
        conv.summaries.forEach(function(s) {
            if (typeof s.coveredEnd === 'number' && s.coveredEnd > lastCovered) lastCovered = s.coveredEnd;
        });
    }
    if (lastCovered >= 0 && lastCovered < regularMsgs.length - 1) {
        regularMsgs = regularMsgs.slice(lastCovered + 1);
    }

    if (regularMsgs.length > maxMsgs) {
        regularMsgs = regularMsgs.slice(regularMsgs.length - maxMsgs);
    }

    // 关键修复：必须深拷贝消息对象，防止后续 Outlet 替换污染原始 conv.messages
    var clonedRegularMsgs = regularMsgs.map(function(m) {
        return { role: m.role, content: m.content };
    });
    apiMessages = apiMessages.concat(clonedRegularMsgs);

    if (presetBuckets.afterHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.afterHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    // 群组模式下，消息里的 speaker 信息由渲染层处理，这里不需要额外改动 prompt 里的 role 名称
    // （未来可在此处根据 speaker 给 assistant 消息加特殊标记）

    // @D (Depth) insertions: support positive and negative depth + correct roles
    var depthEntries = wiByPos[WI_POS.AT_DEPTH] || [];
    insertMessagesAtDepth(apiMessages, depthEntries, charName, userName);
    insertMessagesAtDepth(apiMessages, presetBuckets.inChat, charName, userName);

    // === Outlet Support ===
    // Resolve {{outlet::Name}} in all messages（在克隆对象上操作，不会污染原始存储）
    var wiOutlets = wiResult.outlets || {};
    if (Object.keys(wiOutlets).length > 0) {
        apiMessages.forEach(function(msg) {
            if (msg.content && msg.content.includes('{{outlet::')) {
                msg.content = msg.content.replace(/\{\{outlet::([^}]+)\}\}/gi, function(match, outletName) {
                    var name = outletName.trim();
                    var entries = wiOutlets[name];
                    if (!entries || entries.length === 0) return '';
                    var combined = entries.map(function(e) {
                        return replacePlaceholders(e.content || '', charName, userName);
                    }).join('\n\n');
                    return combined;
                });
            }
        });
    }

    return apiMessages.map(function(m) {
        return { role: m.role, content: replacePlaceholders(m.content, charName, userName) };
    });
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
