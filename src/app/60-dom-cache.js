// ==================== UI Rendering ====================
var dom = {};
function cacheDom() {
    var ids = [
        'sidebar','convList','noConvHint','chatTopBar','charAvatar','chatTitle','chatSubtitle',
        'messagesContainer','emptyState','messageInput','sendBtn','stopBtn','mentionBtn','mentionPill','mentionPillName','mentionPillClear','comfyGenerateBtn',
        'settingsModal','settingsBackdrop','settingsCloseBtn',
        'apiEndpoint','apiKey','saveApiKey','ollamaCompatMode','modelName','contextLength','contextLenVal',
        'maxTokens','maxTokensVal','temperature','tempVal','topP','topPVal',
        'userName','systemPrompt','postHistoryInstructions','fillPostHistoryBtn','fillRoleplayPromptBtn','twoStageEnabled','twoStageTemperature','twoStageTempVal','twoStageTopP','twoStageTopPVal','twoStageIncludeRecentContext','twoStageSystemPrompt','twoStagePostHistoryInstructions','restoreTwoStagePromptBtn','requestCotEnabled','showCotEnabled','userDescription',
        'stPresetImportBtn','stPresetExportBtn','stPresetDeleteBtn','stPresetImportFile','stPresetStatus','stPresetList',
        'importModal','importBackdrop','importCloseBtn','importFileInput','importStatus',
        'promptViewerModal','promptViewerBackdrop','promptViewerCloseBtn','promptViewerContent','copyPromptBtn','promptStageMainBtn','promptStageSecondBtn',
        'archiveBtn','tokenInfo','tokenCount','tokenBar','tokenMax','newChatBtn',
        'sidebarSettingsBtn','topSettingsBtn','viewPromptBtn',
        'exportAllBtn','importConvBtn','convImportFile',
        'charCardPreview','charCardActions','charCardAvatar','charCardName',
        'charCardTagCount','charCardEmptyHint',
        'charImportBtn','charCreateBtn','charEditBtn','charExportBtn','charRemoveBtn',
        'charEditorModal','charEditorBackdrop','charEditorCloseBtn','charEditorCancelBtn','charEditorSaveBtn',
        'charEditName','charEditTags','charEditDescription','charEditPersonality','charEditScenario',
        'charEditFirstMes','charEditMesExample','charEditSystemPrompt','charEditPostHistory','charEditCreatorNotes',
        'summarizeBtn','summarizeModal','summarizeBackdrop','summarizeTurns',
        'summarizeStatus','summarizeCancelBtn','summarizeConfirmBtn',
        'githubBtn',
        // 保留旧引用（即使 modal 已删除）避免其他地方报错
        'summaryHistoryModal','summaryHistoryBackdrop','summaryHistoryCloseBtn','summaryHistoryList',
        'summaryNoHistory',
        // 新增：统一总结管理器所有 DOM（问题3）
        'summaryManagerModal','summaryManagerBackdrop','summaryManagerCloseBtn','summaryManagerList',
        'modeRecentBtn','modeRangeBtn','modeRecentPanel','modeRangePanel',
        'summaryRecentTurns','rangeStart','rangeEnd','previewRangeBtn','rangePreview',
        'summaryGenerateBtn','summaryManagerStatus',
        'summaryEnabled', 'summaryThreshold', 'summaryThresholdVal', 'summaryThresholdWarning', 'summaryMaxWords', 'summaryPrompt',
        'hamburgerBtn','sidebarCloseBtn','sidebarBackdrop','libraryHamburgerBtn',
        'worldBookModal','worldBookBackdrop','worldBookBtn','wiEntryCount',
        'wiImportBtn','wiExportBtn','wiDeleteAllBtn','wiAddEntryBtn','wiCloseBtn','wiNewBookBtn',
        'wiBookName','wiSearch','wiEntryList','wiEntryStats',
        'wiNoSelection','wiEditorForm','wiEditorContainer',
        'wiDisable','wiUidBadge','wiDuplicateBtn','wiDeleteEntryBtn',
        'wiComment','wiOrder','wiKeyChips','wiKeyInput','wiAddKeyBtn',
        'wiSecChips','wiSecInput','wiAddSecBtn','wiSelectiveLogic',
        'wiContent','wiStratConstant','wiStratSelective',
        'wiProbability','wiProbVal','wiUseProb',
        'wiGroup','wiGroupWeight','wiPrioritize','wiUseGroupScoring',
        'wiPosition','wiDepthRow','wiDepth','wiRole','wiOutletRow','wiOutletName',
        'wiSticky','wiCooldown','wiDelay',
        'wiExcludeRec','wiPreventRec','wiDelayRec',
        'wiCharNames','wiCharTags','wiCharExclude',
        'wiMatchCharDesc','wiMatchCharPers','wiMatchScenario','wiMatchPersona','wiMatchCharNote','wiMatchCreatorNotes',
        'wiScanDepth','wiCaseSens','wiMatchWhole','wiIgnoreBudget','wiAutomationId',
        'wiDirtyIndicator',
        'wiImportFile',
        'worldInfoBudgetEnabled','worldInfoBudget','worldInfoBudgetVal',
        'wiBudgetWarning','wiBudgetWarningText','wiBudgetWarningDismiss',
        'uiTheme','lowPowerMode',
        'summarizeUseMainAPI','summarizeApiEndpoint','summarizeApiKey','summarizeModel',
        'summarizeCustomApiSection',
        'comfyEnabled','comfyServer','comfyPositiveNodeId','comfyNegativeNodeId','comfySeedNodeId',
        'comfyNegativePrompt','comfyPromptTemplate','comfyImportWorkflowBtn','comfyWorkflowFile','comfyTestBtn','comfyWorkflowStatus',
        'cloudSyncEnabled','cloudSyncAutoUpload','cloudSyncEndpoint','cloudSyncToken',
        'cloudSyncEncrypted','cloudSyncPassphrase',
        'cloudSyncNowBtn','cloudSyncUploadBtn','cloudSyncDownloadBtn','cloudSyncStatus',
        // Announcement modal
        'announceModal','announceBackdrop','announceCloseBtn','announceDontShow','announceGotItBtn',
        // New Chat Character Picker
        'newChatPickerModal','newChatPickerBackdrop','newChatPickerCloseBtn','newChatPickerList',
        'newChatNoCharacterBtn','newChatImportCharacterBtn',
        // Quick New Chat Action (3-button popup for chat context)
        'quickNewChatModal','quickNewChatBackdrop','quickNewChatCloseBtn',
        'quickNewChatWithCurrentBtn','quickReturnToLibraryBtn','quickNewGroupChatBtn',
        // Group chat MVP
        'newChatPickerMultiBar','newChatPickerMultiHint','newChatPickerMultiCount',
        // @ 提及面板
        'groupMentionModal','groupMentionBackdrop','groupMentionCloseBtn','groupMentionList',
        // (old public library modal entries removed)
    ];
    ids.forEach(function(id) { dom[id] = document.getElementById(id); });
}
