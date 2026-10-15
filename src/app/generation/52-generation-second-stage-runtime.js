/**
 * 新手导读（文件：52-generation-second-stage-runtime.js）
 *
 * 负责什么：这是“回复生成主流程”中的“内容生成、第二阶段、运行流程”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `runSecondStageGeneration(firstStageMessage, onDone)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
// ==================== Second Stage Generation Runtime ====================
/**
 * 在正文生成结束后，单独运行“第二阶段”模型请求来产生可选事项。
 *
 * @param {Object} firstStageMessage - 刚保存的正文消息；其 id 会成为二段消息的 parentId。
 * @param {Function} onDone - 整个流程结束时调用；成功传 null，失败传 Error。
 * @param {Object} replacementMessage - 可选；重生成时仅在成功后原位替换该消息。
 *
 * 二段请求拥有自己的提示词、采样参数、流式 DOM 标识和最终消息记录。这样用户看到的选项
 * 不会追加到正文气泡，也不会在下一轮作为普通历史重复发送。
 */
function runSecondStageGeneration(firstStageMessage, onDone, replacementMessage, conversation, candidateOnly, generationContext) {
    var conv = conversation || getActiveConv();
    if (generationContext && !isGenerationRuntimeOwned(generationContext)) {
        if (onDone) onDone(new Error(t('generation_target_changed')));
        return;
    }
    if (!isLiveConversation(conv) || !firstStageMessage) {
        if (onDone) onDone(new Error(t('generation_target_changed')));
        return;
    }
    normalizeConversationMessageIdentity(conv);
    ensureMessageIdentity(firstStageMessage, 'main');
    var parent = conv.messages.find(function(msg) { return msg.id === firstStageMessage.id && msg.stage !== 'second'; });
    var parentRevision = parent && getMessageRevision(parent);
    var mvuSources = typeof captureMvuSources === 'function' ? captureMvuSources(conv) : null;
    var replacementRevision = replacementMessage && getMessageRevision(replacementMessage);
    var settings = generationContext && generationContext.settings || JSON.parse(JSON.stringify(state.settings || {}));
    var secondPrompt = String(settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var expectsOptions = secondPrompt === String(DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var includeRecentContext = !!settings.twoStageIncludeRecentContext;
    var recentSources = [];
    function getRecentSources(targetConv, main) {
        if (!includeRecentContext) return [];
        var previous = findPreviousMainAssistantMessage(targetConv, main);
        return [previous, findLinkedSecondStageMessage(targetConv, previous), findLatestUserMessageBefore(targetConv, main)].filter(function(msg) {
            return msg && msg.content;
        }).map(function(msg) { return { id: msg.id, revision: getMessageRevision(msg) }; });
    }
    function recentSourcesMatch(targetConv) {
        var c = targetConv || conv;
        var main = c.messages.find(function(msg) { return msg.id === firstStageMessage.id && msg.stage !== 'second'; });
        var current = getRecentSources(c, main);
        return current.length === recentSources.length && current.every(function(source, index) {
            return source.id === recentSources[index].id && source.revision === recentSources[index].revision;
        });
    }
    function sourcesMatch(c) {
        if (generationContext && !isGenerationRuntimeOwned(generationContext)) return false;
        if (mvuSources && !validateMvuSources(c, mvuSources)) return false;
        var main = c.messages.find(function(msg) { return msg.id === firstStageMessage.id && msg.stage !== 'second'; });
        var replacement = replacementMessage && c.messages.find(function(msg) { return msg.id === replacementMessage.id; });
        return main && getMessageRevision(main) === parentRevision && recentSourcesMatch(c) &&
            (!replacementMessage || (replacement && getMessageRevision(replacement) === replacementRevision));
    }

    var promptConv = conv;

    // 真正的请求步骤被包成内部函数，远程 API 可直接执行；默认提示词格式无效时最多追加一次格式纠正请求。
    function requestSecondStage(messages, isCorrection) {
        streamChatWithMessages(
            messages,
            function onToken(token, fullContent, fullCot) {
                if (generationContext && !isGenerationRuntimeOwned(generationContext)) return;
                if (getActiveConv() !== conv || !isLiveConversation(conv)) return;
                updateStreamingBubble(fullContent, conv, t('two_stage_sender') || '第二阶段', fullCot, 'second', generationContext);
            },
            async function onComplete(fullContent, fullCot, usage, completion) {
                var onDoneCalled = false;
                if (generationContext && !isGenerationRuntimeOwned(generationContext)) {
                    if (onDone) onDone(new Error(t('generation_target_changed')));
                    return;
                }
                removeGenerationStreamingBubble('second');
                var c = conv;
                var normalizedContent = expectsOptions ? normalizeSecondStageOptions(fullContent) : String(fullContent || '');
                var interrupted = !!(completion && completion.interrupted);
                state.isGenerating = true;
                appStore.notify('isGenerating');
                try {
                    // 默认提示词下“有文本但没有完整有效选项”才纠正一次；空响应、中断、自定义提示词都不重试。
                    // 纠正前重新核验目标会话与来源修订；来源变化与后续失败复用同一失败保护（原有提示、保留正文/旧选项）。
                    if (expectsOptions && !isCorrection && !interrupted && !normalizedContent.trim() && String(fullContent || '').trim() !== '') {
                        if (!isLiveConversation(c) || !sourcesMatch(c)) throw new Error(t('generation_target_changed'));
                        requestSecondStage(buildSecondStageCorrectionMessages(messages), true);
                        return;
                    }
                    if (!isLiveConversation(c) || !parent || c.messages.indexOf(parent) < 0 || getMessageRevision(parent) !== parentRevision ||
                        (replacementMessage && (c.messages.indexOf(replacementMessage) < 0 || getMessageRevision(replacementMessage) !== replacementRevision)) || !recentSourcesMatch()) {
                        throw new Error(t('generation_target_changed'));
                    }
                    if ((completion && completion.interrupted) || !normalizedContent.trim()) {
                        var interruptionReason = completion && (completion.finishReason || completion.completionReason);
                        throw new Error(completion && completion.interrupted
                            ? t('generation_interrupted_preserved') + (interruptionReason && interruptionReason !== 'done' ? ': ' + interruptionReason : '')
                            : (expectsOptions ? '未返回有效的选项格式' : '未返回有效的第二阶段内容'));
                    }
                    var savedMessage = {
                        id: replacementMessage ? replacementMessage.id : makeId(),
                        role: 'assistant', stage: 'second', parentId: firstStageMessage.id,
                        parentRevision: getMessageRevision(firstStageMessage), content: normalizedContent
                    };
                    if (firstStageMessage.speaker) savedMessage.speaker = firstStageMessage.speaker;
                    if (fullCot) savedMessage.cot = fullCot;
                    if (usage) savedMessage.usage = usage;
                    savedMessage.revision = getMessageRevision(savedMessage);
                    if (!candidateOnly) {
                        if (replacementMessage) {
                            var versions = prepareResponseVersions(c, parent).versions;
                            var version = captureResponseVersion(c, parent);
                            version.secondMessages = version.secondMessages.map(function(msg) { return msg.id === replacementMessage.id ? savedMessage : msg; });
                            versions.push(version);
                            var committed = await commitResponseVersion(c, parent, version, versions, sourcesMatch);
                            var committedSecond = c.messages.find(function(msg) { return msg.id === savedMessage.id; });
                            if (!committed || !committedSecond || getMessageRevision(committedSecond) !== savedMessage.revision ||
                                committed.selectedResponseVersionId !== version.id) throw new Error(t('generation_target_changed'));
                            if (generationContext && generationContext.operation && typeof capturePromptBuildSource === 'function') {
                                generationContext.operation.setSource(capturePromptBuildSource(c));
                            }
                        } else {
                            var candidate = Object.assign({}, c, { messages: c.messages.concat(savedMessage) });
                            function commit(target, validateOnly) {
                                if (!sourcesMatch(target)) return false;
                                if (!validateOnly && !target.messages.some(function(msg) { return msg.id === savedMessage.id; })) target.messages.push(savedMessage);
                                return true;
                            }
                            await persistConversationMutation(c, function(target) {
                                target.messages = target.messages.filter(function(msg) { return msg.id !== savedMessage.id; });
                            }, candidate, commit);
                            if (!isLiveConversation(c) || c.messages.indexOf(parent) < 0 || getMessageRevision(parent) !== parentRevision || !recentSourcesMatch()) throw new Error(t('generation_target_changed'));
                            if (!candidateOnly && !replacementMessage && generationContext && generationContext.operation && typeof capturePromptBuildSource === 'function') {
                                var savedSecondStageMessage = c.messages.find(function(msg) { return msg.id === savedMessage.id; });
                                if (!savedSecondStageMessage || !generationContext.operation.rebindSourceAfterSave(capturePromptBuildSource(c), savedSecondStageMessage)) throw new Error(t('generation_target_changed'));
                            }
                            c.updated = Date.now();
                            c._lastRenderedVisibleCount = 0;
                            if (getActiveConv() === c) { renderMessagesOnly(); renderTokenBar(); }
                        }
                    }
                    if (!candidateOnly && (!generationContext || isGenerationRuntimeOwned(generationContext))) {
                        state.isGenerating = false;
                        appStore.notify('isGenerating');
                    }
                    if (onDone) {
                        onDoneCalled = true;
                        await onDone(null, savedMessage);
                    }
                } catch (error) {
                    if (onDoneCalled) throw error;
                    if (generationContext && !isGenerationRuntimeOwned(generationContext)) {
                        if (onDone) onDone(error);
                        return;
                    }
                    if (!candidateOnly) {
                        state.isGenerating = false;
                        appStore.notify('isGenerating');
                    }
                    renderMessagesOnly();
                    alert('第二阶段生成失败：' + (error.message || error) + (replacementMessage || candidateOnly ? '。原有回复已保留。' : ''));
                    if (onDone) onDone(error);
                }
            },
            function onError(err) {
                if (generationContext && !isGenerationRuntimeOwned(generationContext)) {
                    if (onDone) onDone(err);
                    return;
                }
                removeGenerationStreamingBubble('second');
                if (!candidateOnly) {
                    state.isGenerating = false;
                    appStore.notify('isGenerating');
                }
                renderMessagesOnly();
                alert('第二阶段生成失败：' + (err.message || err) + (replacementMessage ? '。原有选项已保留。' : ''));
                if (onDone) onDone(err);
            },
            {
                conversation: promptConv,
                stage: 'second',
                settings: settings,
                generationContext: generationContext,
                operation: generationContext && generationContext.sequence,
                promptBuildOperation: generationContext && generationContext.operation,
                corrected: isCorrection === true,
                temperature: typeof settings.twoStageTemperature === 'number' ? settings.twoStageTemperature : 0.3,
                topP: typeof settings.twoStageTopP === 'number' ? settings.twoStageTopP : 0.85,
                maxTokens: Math.min(settings.maxTokens || 1024, 1024)
            }
        );
    }

    removeGenerationStreamingBubble('main');
    var messages;
    try {
        promptConv = candidateOnly ? Object.assign({}, conv, {
            messages: conv.messages.filter(function(msg) { return !(msg.stage === 'second' && msg.parentId === firstStageMessage.id); }).map(function(msg) {
                return msg.id === firstStageMessage.id ? firstStageMessage : msg;
            }),
            stLocalVars: conv.stLocalVars ? JSON.parse(JSON.stringify(conv.stLocalVars)) : undefined
        }) : conv;
        if (candidateOnly && typeof refreshMvuCandidate === 'function') {
            promptConv.mvu = conv.mvu ? JSON.parse(JSON.stringify(conv.mvu)) : undefined;
            refreshMvuCandidate(promptConv);
        }
        messages = buildMessagesForSecondStage(firstStageMessage, promptConv, settings);
        recentSources = getRecentSources(promptConv, firstStageMessage);
    } catch (err) {
        console.error('buildMessagesForSecondStage failed:', err);
        alert('构建第二阶段提示词时出错：' + (err.message || err));
        if (onDone) onDone(err);
        return;
    }

    requestSecondStage(messages, false);
}
