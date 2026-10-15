/**
 * 新手导读（文件：67-message-regeneration-runtime.js）
 *
 * 负责什么：这是“消息操作”中的“消息、重新生成、运行流程”部分。
 * 在程序中的位置：它处理消息编辑、删除、复制和重新生成，并维护关联的二段消息。
 * 从哪里开始看：主要从 `prepareGroupSpeakerForRegeneration(conv, lastMsg)`、`handlePrimaryRegenerationError(err)`、`startPrimaryMessageRegeneration(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：修改历史消息会影响后续上下文；重生成前要精确识别目标消息和关联结果。
 */
// ==================== Message Regeneration Runtime ====================
function prepareGroupSpeakerForRegeneration(conv, lastMsg) {
    if (!isGroupChat(conv)) return;
    var mentioned = parseGroupMention(lastMsg.content || '', conv);
    conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
}

function handlePrimaryRegenerationError(err, generationContext) {
    if (generationContext && !isGenerationRuntimeActive(generationContext)) return;
    var streamingEl = document.getElementById('streamingMsg');
    if (streamingEl) streamingEl.remove();
    if (typeof removeGenerationStreamingBubble === 'function') {
        removeGenerationStreamingBubble('main');
        removeGenerationStreamingBubble('second');
    }
    if (generationContext) {
        if (generationContext.operation) generationContext.operation.settled = true;
        releaseGenerationRuntimeState(generationContext);
    } else {
        state.isGenerating = false;
        appStore.notify('isGenerating');
    }
    renderMessagesOnly();
    alert(t('regeneration_failed_preserved') + ': ' + (err.message || err));
}

async function startPrimaryMessageRegeneration(conv, target, continuation) {
    var sequence = ++activePromptBuildSequence;
    var operation = createPromptBuildOperation(sequence, conv);
    var generationContext = createGenerationRuntimeContext(operation, state.settings, conv, continuation ? 'continuation' : 'regeneration');
    state._promptBuildPendingSequence = sequence;
    state._promptBuildOperation = operation;
    state._generationRuntime = generationContext;
    state.isGenerating = true;
    appStore.notify('isGenerating');
    updateInputState();
    var targetRevision = getMessageRevision(target);
    var mvuSources = typeof captureMvuSources === 'function' ? captureMvuSources(conv) : null;
    var targetIndex = conv.messages.indexOf(target);
    var prefix = conv.messages.slice(0, targetIndex + (continuation ? 1 : 0));
    var sources = prefix.map(function(m) { return { id: m.id, revision: getMessageRevision(m) }; });
    var requestConv = Object.assign({}, conv, {
        messages: JSON.parse(JSON.stringify(prefix)),
        summaries: JSON.parse(JSON.stringify(conv.summaries || [])),
        group: conv.group ? JSON.parse(JSON.stringify(conv.group)) : null,
        character: conv.character ? JSON.parse(JSON.stringify(conv.character)) : null,
        mvu: conv.mvu ? JSON.parse(JSON.stringify(conv.mvu)) : undefined,
        stLocalVars: conv.stLocalVars ? JSON.parse(JSON.stringify(conv.stLocalVars)) : undefined
    });
    requestConv._wiCache = null;
    if (continuation) requestConv.summaries = requestConv.summaries.filter(function(summary) { return !(summary.sourceMessages || []).some(function(source) { return source.id === target.id; }); });
    if (isGroupChat(conv)) {
        var member = getGroupMembers(conv).find(function(m) { return m.character && m.character.name === target.speaker; });
        requestConv._nextGroupSpeaker = member ? JSON.parse(JSON.stringify(member.character)) : getNextGroupSpeaker(requestConv);
    }
    if (continuation && typeof getMessageSpeakerCharacter === 'function') {
        var originalSpeaker = getMessageSpeakerCharacter(target, conv);
        if (originalSpeaker) {
            if (isGroupChat(requestConv)) {
                requestConv._nextGroupSpeaker = JSON.parse(JSON.stringify(originalSpeaker));
                requestConv._forcedSpeaker = requestConv._nextGroupSpeaker;
                var originalMember = requestConv.group.members.find(function(item) { return item.character.name === originalSpeaker.name; });
                if (originalMember) originalMember.character = requestConv._nextGroupSpeaker;
                else requestConv.group.members.push({ character: requestConv._nextGroupSpeaker, muted: false, order: requestConv.group.members.length });
            }
            else requestConv.character = originalSpeaker;
        }
    }
    function sourcesMatch(c) {
        if (mvuSources && !validateMvuSources(c, mvuSources)) return false;
        var index = c.messages.findIndex(function(m) { return m.id === target.id && m.stage !== 'second'; });
        if (index < 0) return false;
        var current = c.messages.slice(0, index + (continuation ? 1 : 0));
        return current.length === sources.length && sources.every(function(source, index) {
            return current[index].id === source.id && getMessageRevision(current[index]) === source.revision;
        });
    }
    function matchesTarget() {
        return isGenerationRuntimeOwned(generationContext) && isLiveConversation(conv) && conv.messages.indexOf(target) >= 0 && getMessageRevision(target) === targetRevision && sourcesMatch(conv);
    }
    async function saveCandidate(candidate, second, interrupted) {
        if (!matchesTarget()) throw new Error(t('generation_target_changed'));
        var prepared = prepareResponseVersions(conv, target);
        var versions = prepared.versions;
        var version = { id: makeId(), created: Date.now(), message: cloneResponseMessage(candidate), secondMessages: second ? [second] : [] };
        if (interrupted) version.interrupted = true;
        versions.push(version);
        var selected = interrupted ? prepared.current : version;
        var committed = await commitResponseVersion(conv, target, selected, versions, function(current) {
            return isGenerationRuntimeOwned(generationContext) && sourcesMatch(current);
        });
        var current = conv.messages.find(function(message) { return message.id === target.id && message.stage !== 'second'; });
        if (!current || current.selectedResponseVersionId !== selected.id || getMessageRevision(current) !== getMessageRevision(committed)) {
            throw new Error(t('generation_target_changed'));
        }
        if (second && !conv.messages.some(function(message) { return message.id === second.id && getMessageRevision(message) === second.revision; })) {
            throw new Error(t('generation_target_changed'));
        }
        if (generationContext.operation && typeof capturePromptBuildSource === 'function') {
            generationContext.operation.setSource(capturePromptBuildSource(conv));
        }
        return committed;
    }
    var messages;
    function releasePendingBuild() {
        if (state._promptBuildPendingSequence === sequence) state._promptBuildPendingSequence = null;
        if (state._promptBuildOperation === operation) state._promptBuildOperation = null;
    }
    try {
        operation.setSource(capturePromptBuildSource(requestConv));
        messages = typeof buildMessagesForAPIAsync === 'function'
            ? await buildMessagesForAPIAsync(requestConv, { operation: operation, settings: generationContext.settings })
            : buildMessagesForAPI(requestConv);
        if (continuation) messages.push({ role: 'system', content: '紧接最后一条助手正文继续写作。只返回新增正文，不重复已有内容，不输出操作选项。' });
    } catch (error) {
        if (sequence !== activePromptBuildSequence) return;
        handlePrimaryRegenerationError(error, generationContext);
        return;
    } finally {
        releasePendingBuild();
    }
    if (sequence !== activePromptBuildSequence) return;
    if (!state.isGenerating || operation.cancelled) {
        if (isGenerationRuntimeOwned(generationContext)) releaseGenerationRuntimeState(generationContext);
        return;
    }
    if (!matchesTarget()) { handlePrimaryRegenerationError(new Error(t('generation_target_changed')), generationContext); return; }
    streamChatWithMessages(messages, function(token, fullContent, fullCot) {
        if (getActiveConv() === conv && matchesTarget()) updateStreamingBubble(continuation ? target.content + fullContent : fullContent, conv, target.speaker || getCurrentGeneratingSpeakerName(requestConv), fullCot, 'main', generationContext);
    }, async function(fullContent, fullCot, usage, completion) {
        if (!isGenerationRuntimeActive(generationContext)) return;
        if (!matchesTarget()) {
            handlePrimaryRegenerationError(new Error(t('generation_target_changed')), generationContext);
            return;
        }
        removeGenerationStreamingBubble('main');
        state.isGenerating = true;
        appStore.notify('isGenerating');
        var delta = typeof fullContent === 'string' ? isolatePrimaryStageContentWithSettings(fullContent, generationContext.settings) : '';
        var content = delta.trim() ? (continuation ? target.content + delta : delta.trim()) : '';
        var candidate = continuation ? Object.assign(cloneResponseMessage(target), { content: content }) : { id: target.id, role: 'assistant', stage: 'main', content: content };
        if (typeof clearMvuManualOverride === 'function') clearMvuManualOverride(candidate);
        if (target.speaker) candidate.speaker = target.speaker;
        if (fullCot) candidate.cot = fullCot;
        if (usage) candidate.usage = usage;
        try {
            if (!content) throw new Error(t('regeneration_failed_preserved'));
            if (completion && completion.interrupted) {
                await saveCandidate(candidate, null, true);
                var interruptionReason = completion.finishReason || completion.completionReason;
                alert(t('generation_interrupted_preserved') + (interruptionReason && interruptionReason !== 'done' ? ': ' + interruptionReason : ''));
                completeGenerationTurn(conv, generationContext);
                return;
            } else if (generationContext.settings.twoStageEnabled) {
                if (!matchesTarget()) throw new Error(t('generation_target_changed'));
                runSecondStageGeneration(candidate, async function(error, second) {
                    if (!isGenerationRuntimeActive(generationContext)) return;
                    state.isGenerating = true;
                    appStore.notify('isGenerating');
                    try {
                        if (error) throw error;
                        await saveCandidate(candidate, second, false);
                        completeGenerationTurn(conv, generationContext);
                    } catch (saveError) {
                        handlePrimaryRegenerationError(saveError, generationContext);
                    }
                }, null, conv, true, generationContext);
                return;
            } else {
                await saveCandidate(candidate, null, false);
                completeGenerationTurn(conv, generationContext);
                return;
            }
        } catch (error) {
            handlePrimaryRegenerationError(error, generationContext);
        }
    }, function(error) { handlePrimaryRegenerationError(error, generationContext); }, {
        conversation: requestConv,
        stage: continuation ? 'continuation' : 'regeneration',
        settings: generationContext.settings,
        generationContext: generationContext,
        promptBuildOperation: operation,
        operation: sequence
    });
    updateInputState();
}
