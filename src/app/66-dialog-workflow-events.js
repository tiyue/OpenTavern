// ==================== Dialog Workflow Events ====================
function bindCharacterImportModalEvents() {
    // Import modal close
    dom.importCloseBtn.addEventListener('click', function() { dom.importModal.classList.add('hidden'); });
    dom.importBackdrop.addEventListener('click', function() { dom.importModal.classList.add('hidden'); });

    // File import (supports .json and SillyTavern .png embedded cards)
    dom.importFileInput.addEventListener('change', async function(e) {
        var file = e.target.files[0];
        if (!file) return;

        dom.importStatus.classList.remove('hidden');
        dom.importStatus.textContent = 'Reading...';

        try {
            let json;
            const lowerName = (file.name || '').toLowerCase();
            let attachedPreview = null;

            if (lowerName.endsWith('.png')) {
                // For PNG cards, also capture the visual image itself as preview (so imported cards show their art)
                attachedPreview = await new Promise(function(resolve, reject) {
                    var r = new FileReader();
                    r.onload = function() { resolve(r.result); };
                    r.onerror = reject;
                    r.readAsDataURL(file);
                });
                json = await extractCharaFromPng(file);
            } else {
                // JSON path (original)
                const text = await new Promise(function(resolve, reject) {
                    var r = new FileReader();
                    r.onload = function() { resolve(r.result); };
                    r.onerror = reject;
                    r.readAsText(file);
                });
                json = JSON.parse(text);
            }

            var character = importCharacterCard(json);
            if (attachedPreview) {
                character.previewImage = attachedPreview;
            }
            var conv = getActiveConv();
            if (!conv) { newConversation(); conv = getActiveConv(); }

            var hasMsgs = conv.messages.some(function(m) { return m.role !== 'system'; });
            if (hasMsgs) {
                saveCurrentConversation();
                // 捕获旧对话的世界书（legacy + 新 global）
                var oldWorldInfo = conv.worldInfo ? JSON.parse(JSON.stringify(conv.worldInfo)) : null;
                var oldWorldBookIds = Array.isArray(conv.worldBookIds) ? conv.worldBookIds.slice() : [];

                var newConv = defaultConversation();
                state.conversations[newConv.id] = newConv;
                state.conversationOrder.unshift(newConv.id);
                state.activeConvId = newConv.id;
                conv = newConv;

                if (oldWorldInfo) {
                    conv.worldInfo = oldWorldInfo;
                }
                if (oldWorldBookIds.length > 0) {
                    conv.worldBookIds = oldWorldBookIds;
                }
            }

            conv.character = character;
            conv.title = t('chat_with') + character.name;
            conv.messages = [];

            currentCharacterName = character.name;

            // ===== 自动导入角色卡内嵌的 character_book（支持 v1/v2/v3）并关联到当前对话 =====
            var embeddedBook = null;
            try {
                embeddedBook = importCharacterBookFromCard(json, character.name);
                if (embeddedBook) {
                    conv.worldBookIds = conv.worldBookIds || [];
                    if (!conv.worldBookIds.includes(embeddedBook.id)) {
                        conv.worldBookIds.push(embeddedBook.id);
                    }
                }
            } catch (e) {
                console.warn('导入角色卡内嵌世界书失败（不影响角色导入）:', e);
            }

            // 注册到全局角色库
            if (character.name) {
                const key = character.name.trim().toLowerCase();
                if (!state.characters) state.characters = {};
                state.characters[key] = JSON.parse(JSON.stringify(character));
            }

            var charName = character.name;
            var userName = state.settings.userName || 'User';
            var firstMes = replacePlaceholders(character.first_mes, charName, userName);
            if (firstMes) {
                conv.messages.push({ role: 'assistant', content: firstMes });
            }

            conv.updated = Date.now();
            persistState();

            // 让卡片库（如果可见或稍后返回）立刻看到新导入的卡；解决“导入后需刷新页面才显示”的问题
            if (typeof renderLibraryGrids === 'function') {
                renderLibraryGrids();
            }

            renderAll();
            dom.importModal.classList.add('hidden');
            dom.importStatus.classList.remove('hidden');

            var successText = t('import_success') + character.name;
            if (embeddedBook) {
                var entryCount = Object.keys(embeddedBook.entries || {}).length;
                successText += '（已自动关联内嵌世界书 · ' + entryCount + ' 条目）';
            }
            dom.importStatus.textContent = successText;
            dom.importStatus.className = 'text-xs text-emerald-400 mt-3 text-center';
            setTimeout(function() { dom.importStatus.classList.add('hidden'); }, 2800);
        } catch (err) {
            dom.importStatus.classList.remove('hidden');
            dom.importStatus.textContent = t('import_error') + ': ' + (err.message || err);
            dom.importStatus.className = 'text-xs text-red-400 mt-3 text-center';
        } finally {
            if (dom.importFileInput) dom.importFileInput.value = '';
        }
    });
}

function bindPromptAndSummaryWorkflowEvents() {
    // Prompt viewer
    var currentPromptViewerStage = 'main';

    function setPromptStageButtons(stage) {
        currentPromptViewerStage = stage || 'main';
        var active = ['bg-amber-500/20', 'text-amber-300', 'border-amber-500/20'];
        var inactive = ['bg-white/5', 'text-zinc-400', 'border-white/10'];
        [
            { btn: dom.promptStageMainBtn, stage: 'main' },
            { btn: dom.promptStageSecondBtn, stage: 'second' }
        ].forEach(function(item) {
            if (!item.btn) return;
            item.btn.classList.remove.apply(item.btn.classList, active.concat(inactive));
            item.btn.classList.add.apply(item.btn.classList, item.stage === currentPromptViewerStage ? active : inactive);
        });
    }

    function findLatestMainAssistantMessage(conv) {
        if (!conv || !Array.isArray(conv.messages)) return null;
        for (var i = conv.messages.length - 1; i >= 0; i--) {
            var m = conv.messages[i];
            if (m && m.role === 'assistant' && m.stage !== 'second') return m;
        }
        return null;
    }

    function refreshPromptViewer() {
        try {
            var messages;
            if (currentPromptViewerStage === 'second') {
                var conv = getActiveConv();
                var latestMain = findLatestMainAssistantMessage(conv);
                messages = buildMessagesForSecondStage(latestMain);
            } else {
                messages = buildMessagesForAPI();
            }
            var text = formatPromptMessages(messages);
            dom.promptViewerContent.textContent = text || t('no_messages_to_send');
        } catch (err) {
            console.error('showFullPrompt error:', err);
            alert('无法生成提示词预览：' + (err.message || err));
        }
    }

    function showFullPrompt() {
        setPromptStageButtons('main');
        refreshPromptViewer();
        dom.promptViewerModal.classList.remove('hidden');
    }
    dom.viewPromptBtn.addEventListener('click', showFullPrompt);
    if (dom.promptStageMainBtn) dom.promptStageMainBtn.addEventListener('click', function() {
        setPromptStageButtons('main');
        refreshPromptViewer();
    });
    if (dom.promptStageSecondBtn) dom.promptStageSecondBtn.addEventListener('click', function() {
        setPromptStageButtons('second');
        refreshPromptViewer();
    });
    dom.promptViewerCloseBtn.addEventListener('click', function() { dom.promptViewerModal.classList.add('hidden'); });
    dom.promptViewerBackdrop.addEventListener('click', function() { dom.promptViewerModal.classList.add('hidden'); });

    // Copy prompt
    dom.copyPromptBtn.addEventListener('click', function() {
        var text = dom.promptViewerContent.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
                dom.copyPromptBtn.textContent = t('copied');
                setTimeout(function() { dom.copyPromptBtn.textContent = t('copy'); }, 1500);
            });
        }
    });

    // 总结管理器入口（只保留主按钮）
    dom.summarizeBtn.addEventListener('click', openSummaryManager);

    // 总结管理器内部事件绑定（只绑定一次）
    if (dom.summaryManagerCloseBtn) {
        dom.summaryManagerCloseBtn.addEventListener('click', function() {
            dom.summaryManagerModal.classList.add('hidden');
        });
    }
    if (dom.summaryManagerBackdrop) {
        dom.summaryManagerBackdrop.addEventListener('click', function() {
            dom.summaryManagerModal.classList.add('hidden');
        });
    }

    // 模式切换
    if (dom.modeRecentBtn) {
        dom.modeRecentBtn.addEventListener('click', function() {
            dom.modeRecentPanel.classList.remove('hidden');
            dom.modeRangePanel.classList.add('hidden');
            dom.modeRecentBtn.classList.add('bg-white/10', 'text-zinc-100');
            dom.modeRangeBtn.classList.remove('bg-white/10', 'text-zinc-100');
            if (dom.rangePreview) dom.rangePreview.innerHTML = '';
        });
    }
    if (dom.modeRangeBtn) {
        dom.modeRangeBtn.addEventListener('click', function() {
            dom.modeRecentPanel.classList.add('hidden');
            dom.modeRangePanel.classList.remove('hidden');
            dom.modeRangeBtn.classList.add('bg-white/10', 'text-zinc-100');
            dom.modeRecentBtn.classList.remove('bg-white/10', 'text-zinc-100');
        });
    }

    // 自定义范围预览
    if (dom.previewRangeBtn) {
        dom.previewRangeBtn.addEventListener('click', previewCustomRange);
    }
    if (dom.rangeStart) {
        dom.rangeStart.addEventListener('input', previewCustomRange);
    }
    if (dom.rangeEnd) {
        dom.rangeEnd.addEventListener('input', previewCustomRange);
    }

    // 生成总结按钮
    if (dom.summaryGenerateBtn) {
        dom.summaryGenerateBtn.addEventListener('click', doGenerateSummary);
    }
}
