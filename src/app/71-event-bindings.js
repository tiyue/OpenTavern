// ==================== Event Bindings ====================
function bindEvents() {
    dom.sendBtn.addEventListener('click', sendMessage);
    if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.addEventListener('click', generateComfyImageForCurrentChat);
    dom.messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    dom.messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    });

    // @ 提及按钮（群组聊天专用）→ 打开角色选择面板
    if (dom.mentionBtn) {
        dom.mentionBtn.addEventListener('click', function() {
            const conv = getActiveConv();
            if (!isGroupChat(conv)) {
                alert(t('group_mention_no_group'));
                return;
            }
            showGroupMentionPanel(conv);
        });
    }

    // @ 指定气泡的清除按钮（只指定一个角色，点 × 即可移除）
    if (dom.mentionPillClear) {
        dom.mentionPillClear.addEventListener('click', function(e) {
            e.stopPropagation();
            clearPendingGroupMention();
        });
    }

    // 点击气泡名称区域可重新打开选择器更换指定的角色
    if (dom.mentionPill) {
        dom.mentionPill.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'mentionPillClear') return;
            const conv = getActiveConv();
            if (conv && isGroupChat(conv)) {
                showGroupMentionPanel(conv);
            }
        });
    }

    dom.stopBtn.addEventListener('click', function() { stopGeneration(); });
    // New: only in active chat view, show the 3-button contextual popup to avoid forcing full card picker.
    // In library view the button keeps the original "pick from cards" behavior.
    if (dom.newChatBtn) {
        dom.newChatBtn.addEventListener('click', function() {
            if (currentView === 'chat' && typeof showQuickNewChatModal === 'function') {
                showQuickNewChatModal();
            } else {
                showNewChatCharacterPicker();
            }
        });
    }
    dom.archiveBtn.addEventListener('click', archiveCurrentConversation);

    // Robust tab bindings for my/public library switching
    const tabMyEl = document.getElementById('tabMy');
    const tabPubEl = document.getElementById('tabPublic');
    if (tabMyEl) {
        tabMyEl.onclick = () => { if (typeof setActiveTab === 'function') setActiveTab('my'); };
    }
    if (tabPubEl) {
        tabPubEl.onclick = () => { if (typeof setActiveTab === 'function') setActiveTab('public'); };
    }

    // Search and filter bindings for main library (moved from old left sidebar library + new orientation filter)
    const libSearch = document.getElementById('librarySearch');
    if (libSearch) {
        libSearch.oninput = () => {
            librarySearchQuery = libSearch.value;
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        };
    }
    document.querySelectorAll('#libraryView [data-filter]').forEach(btn => {
        btn.onclick = () => {
            libraryFilter = btn.dataset.filter;
            document.querySelectorAll('#libraryView [data-filter]').forEach(b => b.classList.remove('bg-amber-500/20', 'text-amber-300'));
            btn.classList.add('bg-amber-500/20', 'text-amber-300');
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        };
    });

    // Mobile sidebar
    dom.hamburgerBtn.addEventListener('click', toggleSidebar);
    if (dom.libraryHamburgerBtn) {
        dom.libraryHamburgerBtn.addEventListener('click', toggleSidebar);
    }
    dom.sidebarCloseBtn.addEventListener('click', handleSidebarClose);
    dom.sidebarBackdrop.addEventListener('click', closeSidebar);
    window.addEventListener('resize', function() {
        if (!isMobile()) closeSidebar();
    });

    // Message action buttons (event delegation)
    dom.messagesContainer.addEventListener('click', function(e) {
        var btn = e.target.closest('.msg-action-btn');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var idx = parseInt(btn.getAttribute('data-msg-idx'));
        if (isNaN(idx)) return;
        if (action === 'copy') {
            var conv = getActiveConv();
            if (conv && conv.messages[idx]) {
                copyMessageText(conv.messages[idx].content);
            }
        } else if (action === 'delete') {
            deleteMessage(idx);
        } else if (action === 'retry') {
            if (state.isGenerating) return;
            regenerateMessage(idx);
        } else if (action === 'edit') {
            editMessage(idx, btn);
        }
    });

    // Language switcher
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setLanguage(this.getAttribute('data-lang'));
        });
    });

    // Create new character from scratch
    dom.charCreateBtn.addEventListener('click', openCharacterEditor);

    // Import character — always-visible import button
    dom.charImportBtn.addEventListener('click', function() {
        dom.importModal.classList.remove('hidden');
        dom.importStatus.classList.add('hidden');
        dom.importFileInput.value = '';
    });

    // Character editor
    dom.charEditBtn.addEventListener('click', openCharacterEditor);
    dom.charEditorCloseBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorBackdrop.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorCancelBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorSaveBtn.addEventListener('click', saveCharacterEdits);

    // Conversation export all
    dom.exportAllBtn.addEventListener('click', exportAllConversations);

    // Conversation import
    dom.importConvBtn.addEventListener('click', function() { dom.convImportFile.click(); });
    dom.convImportFile.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) importConversations(file);
        dom.convImportFile.value = '';
    });

    // Character remove
    dom.charRemoveBtn.addEventListener('click', removeCharacter);

    // Character export
    dom.charExportBtn.addEventListener('click', exportCharacter);

    // World Book button (below character card)
    dom.worldBookBtn.addEventListener('click', openWorldBookModal);

    if (dom.sidebarSettingsBtn) dom.sidebarSettingsBtn.addEventListener('click', openSettings);
    if (dom.topSettingsBtn) dom.topSettingsBtn.addEventListener('click', openSettings);
    if (dom.settingsCloseBtn) dom.settingsCloseBtn.addEventListener('click', closeSettings);
    if (dom.settingsBackdrop) dom.settingsBackdrop.addEventListener('click', closeSettings);
    if (dom.stPresetImportBtn) dom.stPresetImportBtn.addEventListener('click', function() {
        if (dom.stPresetImportFile) dom.stPresetImportFile.click();
    });
    if (dom.stPresetImportFile) dom.stPresetImportFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importSillyTavernPresetFile(file);
    });
    if (dom.stPresetExportBtn) dom.stPresetExportBtn.addEventListener('click', exportSillyTavernPreset);
    if (dom.stPresetDeleteBtn) dom.stPresetDeleteBtn.addEventListener('click', deleteSillyTavernPreset);
    if (dom.comfyImportWorkflowBtn) dom.comfyImportWorkflowBtn.addEventListener('click', function() {
        if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.click();
    });
    if (dom.comfyWorkflowFile) dom.comfyWorkflowFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (file) importComfyWorkflowFile(file);
    });
    if (dom.comfyTestBtn) dom.comfyTestBtn.addEventListener('click', testComfyConnection);

    // Settings sliders
    function bindSlider(slider, valEl, format) {
        slider.addEventListener('input', function() { valEl.textContent = format ? format(this.value) : this.value; });
    }
    bindSlider(dom.contextLength, dom.contextLenVal);
    bindSlider(dom.maxTokens, dom.maxTokensVal);
    bindSlider(dom.temperature, dom.tempVal);
    bindSlider(dom.topP, dom.topPVal);
    if (dom.twoStageTemperature && dom.twoStageTempVal) bindSlider(dom.twoStageTemperature, dom.twoStageTempVal);
    if (dom.twoStageTopP && dom.twoStageTopPVal) bindSlider(dom.twoStageTopP, dom.twoStageTopPVal);
    bindSlider(dom.worldInfoBudget, dom.worldInfoBudgetVal);

    // 实时更新“触发阈值高于上下文长度”的警告

    if (dom.contextLength) {
        dom.contextLength.addEventListener('input', updateSummaryThresholdWarning);
    }
    if (dom.summaryThreshold) {
        dom.summaryThreshold.addEventListener('input', function() {
            // 实时更新 state.settings + 关闭设置时会主动调用 autoSummarize() 兜底检查
            state.settings.summaryThreshold = parseInt(this.value) || 12;
            if (dom.summaryThresholdVal) {
                dom.summaryThresholdVal.textContent = state.settings.summaryThreshold;
            }
            updateSummaryThresholdWarning();
        });
    }

    // 实时更新 summaryEnabled（复选框）
    if (dom.summaryEnabled) {
        dom.summaryEnabled.addEventListener('change', function() {
            state.settings.summaryEnabled = this.checked;
        });
    }

    bindCharacterImportModalEvents();

    bindPromptAndSummaryWorkflowEvents();

    // Summary threshold slider in settings
    bindSlider(dom.summaryThreshold, dom.summaryThresholdVal);
    updateSummaryThresholdWarning();

    // Summarization API section toggle helper

    if (dom.summarizeUseMainAPI) {
        dom.summarizeUseMainAPI.addEventListener('change', toggleSummarizeCustomSection);
    }

    // Announcement modal bindings
    if (dom.announceCloseBtn) {
        dom.announceCloseBtn.addEventListener('click', function() {
            hideAnnouncementModal(); // 仅关闭，不永久记录
        });
    }
    if (dom.announceBackdrop) {
        dom.announceBackdrop.addEventListener('click', function() {
            hideAnnouncementModal(); // 仅关闭，不永久记录
        });
    }
    if (dom.announceGotItBtn) {
        dom.announceGotItBtn.addEventListener('click', function() {
            var dontShow = !!(dom.announceDontShow && dom.announceDontShow.checked);
            dismissAnnouncement(dontShow); // 勾选则永久关闭，否则仅本次关闭
        });
    }

    // Announcement language switcher buttons (for first-time international users)
    document.querySelectorAll('.announce-lang-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var lang = this.getAttribute('data-lang');
            if (lang) {
                setLanguage(lang);
                // setLanguage already calls updateAnnouncementLangButtons() via the hook below
            }
        });
    });

    // Escape to close modals / sidebar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (isMobile() && dom.sidebar.classList.contains('open')) { closeSidebar(); return; }
            if (!dom.settingsModal.classList.contains('hidden')) closeSettings();
            if (!dom.charEditorModal.classList.contains('hidden')) dom.charEditorModal.classList.add('hidden');
            if (!dom.importModal.classList.contains('hidden')) dom.importModal.classList.add('hidden');
            if (!dom.promptViewerModal.classList.contains('hidden')) dom.promptViewerModal.classList.add('hidden');
            // 兼容旧引用 + 新管理器
            if (dom.summarizeModal && !dom.summarizeModal.classList.contains('hidden')) dom.summarizeModal.classList.add('hidden');
            if (dom.summaryHistoryModal && !dom.summaryHistoryModal.classList.contains('hidden')) dom.summaryHistoryModal.classList.add('hidden');
            if (dom.summaryManagerModal && !dom.summaryManagerModal.classList.contains('hidden')) dom.summaryManagerModal.classList.add('hidden');
            if (!dom.worldBookModal.classList.contains('hidden')) closeWorldBookModal();
            if (!dom.announceModal.classList.contains('hidden')) hideAnnouncementModal();
        }
    });
}
