// ==================== Character Panel UI ====================
function renderCharacterCard() {
    var conv = getActiveConv();
    if (!conv) {
        if (dom.charCardPreview) dom.charCardPreview.classList.add('hidden');
        if (dom.charCardEmptyHint) dom.charCardEmptyHint.classList.remove('hidden');
        if (dom.charEditBtn) dom.charEditBtn.classList.add('hidden');
        if (dom.charExportBtn) dom.charExportBtn.classList.add('hidden');
        if (dom.charRemoveBtn) dom.charRemoveBtn.classList.add('hidden');
        renderWorldInfoBadge();
        return;
    }

    if (isGroupChat(conv)) {
        // 群聊模式：在角色卡区域显示群组成员摘要（避免显示“无角色卡”空状态）
        if (dom.charCardPreview) dom.charCardPreview.classList.remove('hidden');
        if (dom.charCardEmptyHint) dom.charCardEmptyHint.classList.add('hidden');
        if (dom.charEditBtn) dom.charEditBtn.classList.add('hidden');
        if (dom.charExportBtn) dom.charExportBtn.classList.add('hidden');
        if (dom.charRemoveBtn) dom.charRemoveBtn.classList.add('hidden');

        const members = getGroupMembers(conv);
        if (dom.charCardAvatar) {
            dom.charCardAvatar.textContent = 'Group';
            dom.charCardAvatar.className = 'w-7 h-7 rounded-lg ot-avatar-fill flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0';
        }
        if (dom.charCardName) {
            dom.charCardName.textContent = (conv.group && conv.group.name) ? conv.group.name : '群聊';
        }
        if (dom.charCardTagCount) {
            const shortList = members
                .map(m => (m.character && m.character.name) ? m.character.name : '')
                .filter(Boolean)
                .slice(0, 2)
                .join('、');
            const more = members.length > 2 ? ' 等' : '';
            dom.charCardTagCount.textContent = members.length + ' 角色' + (shortList ? ' · ' + shortList + more : '');
        }
        renderWorldInfoBadge();
        return;
    }

    var character = conv.character;

    if (character) {
        if (dom.charCardPreview) dom.charCardPreview.classList.remove('hidden');
        if (dom.charCardEmptyHint) dom.charCardEmptyHint.classList.add('hidden');
        if (dom.charEditBtn) dom.charEditBtn.classList.remove('hidden');
        if (dom.charExportBtn) dom.charExportBtn.classList.remove('hidden');
        if (dom.charRemoveBtn) dom.charRemoveBtn.classList.remove('hidden');

        const src = character.previewImage || character.avatar;
        if (dom.charCardAvatar) {
            if (src) {
                dom.charCardAvatar.innerHTML = `<img src="${src}" class="w-full h-full object-cover rounded-lg" alt="${character.name || ''}">`;
                dom.charCardAvatar.className = 'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
            } else {
                dom.charCardAvatar.textContent = character.name ? character.name.charAt(0).toUpperCase() : '?';
                dom.charCardAvatar.className = 'w-7 h-7 rounded-lg ot-avatar-fill flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0';
            }
        }

        if (dom.charCardName) dom.charCardName.textContent = character.name || t('char_empty_name');
        if (dom.charCardTagCount) {
            var tagCount = character.tags ? character.tags.length : 0;
            dom.charCardTagCount.textContent = tagCount + ' tag' + (tagCount !== 1 ? 's' : '');
        }
    } else {
        if (dom.charCardPreview) dom.charCardPreview.classList.add('hidden');
        if (dom.charCardEmptyHint) dom.charCardEmptyHint.classList.remove('hidden');
        if (dom.charEditBtn) dom.charEditBtn.classList.add('hidden');
        if (dom.charExportBtn) dom.charExportBtn.classList.add('hidden');
        if (dom.charRemoveBtn) dom.charRemoveBtn.classList.add('hidden');
    }
    renderWorldInfoBadge();
}

async function removeCharacter() {
    if (!await showGlassConfirm(t('char_remove_confirm'), { title: '\u79fb\u9664\u89d2\u8272\u5361', danger: true, okText: '\u79fb\u9664' })) return;
    var conv = getActiveConv();
    if (!conv) return;
    conv.character = null;
    if (conv.title.indexOf(t('chat_with')) === 0) {
        conv.title = t('new_chat_title');
    }
    conv.updated = Date.now();
    persistState();
    requestFullRender();
}

/**
 * 从全局角色库彻底删除一个角色卡（不影响任何已有对话的嵌入副本）
 */
function deleteCharacterFromLibrary(nameOrKey) {
    if (!nameOrKey) return;
    const key = nameOrKey.trim().toLowerCase();

    if (!state.characters || !state.characters[key]) return;

    delete state.characters[key];
    // 强制立即持久化，确保从浏览器存储中真正移除（避免 debounce 导致刷新前未写入）
    persistState(true);

    // 【Storage Fix】额外确保持久化（使用 StorageService 主路径，LS 仅作为最后同步兜底）
    try {
        const directData = {
            settings: (typeof getSafeSettingsForPersist === 'function' ? getSafeSettingsForPersist() : (state.settings || {})),
            conversations: state.conversations || {},
            conversationOrder: state.conversationOrder || [],
            activeConvId: state.activeConvId || null,
            worldBooks: state.worldBooks || {},
            characters: state.characters || {},
            charactersMigrated: !!state._charactersMigrated,
            lastSaved: Date.now()
        };
        // 【Fix Bug 1&4】更新快照以便 pagehide 在页面关闭时同步刷写
        if (StorageService) {
            StorageService._lastSaveSnapshot = directData;
        }
        if (StorageService && typeof StorageService.saveAll === 'function') {
            // 异步但立即触发（OPFS 写锁会串行化并发调用）
            StorageService.saveAll(directData);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(directData));
        }
    } catch (e) {
        console.warn('[DeleteCard] direct persist fallback failed:', e);
    }

    // 刷新可能正在显示的库网格（让删除立刻在卡片库生效）
    if (typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }

    // 如果当前正在显示选择器，刷新它
    const pickerList = document.getElementById('newChatPickerList');
    if (pickerList && !document.getElementById('newChatPickerModal').classList.contains('hidden')) {
        // 简单粗暴刷新整个选择器
        showNewChatCharacterPicker();
    }
}

function openCharacterEditor() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    dom.charEditName.value = c ? c.name : '';
    dom.charEditTags.value = c && c.tags ? c.tags.join(', ') : '';
    dom.charEditDescription.value = c ? c.description : '';
    dom.charEditPersonality.value = c ? c.personality : '';
    dom.charEditScenario.value = c ? c.scenario : '';
    dom.charEditFirstMes.value = c ? c.first_mes : '';
    dom.charEditMesExample.value = c ? c.mes_example : '';
    dom.charEditSystemPrompt.value = c ? c.system_prompt : '';
    dom.charEditPostHistory.value = c ? c.post_history_instructions : '';
    dom.charEditCreatorNotes.value = c ? c.creator_notes : '';
    dom.charEditorModal.classList.remove('hidden');
}

function saveCharacterEdits() {
    var conv = getActiveConv();
    if (!conv) return;

    var tagsRaw = dom.charEditTags.value.trim();
    var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

    var character = {
        name: dom.charEditName.value.trim() || 'Unnamed',
        description: dom.charEditDescription.value,
        personality: dom.charEditPersonality.value,
        scenario: dom.charEditScenario.value,
        first_mes: dom.charEditFirstMes.value,
        mes_example: dom.charEditMesExample.value,
        system_prompt: dom.charEditSystemPrompt.value,
        post_history_instructions: dom.charEditPostHistory.value,
        creator_notes: dom.charEditCreatorNotes.value,
        tags: tags,
        alternate_greetings: conv.character ? (conv.character.alternate_greetings || []) : [],
        extensions: conv.character ? (conv.character.extensions || {}) : {}
    };

    var wasNew = !conv.character || !conv.character.name || conv.character.name === 'Unnamed';
    conv.character = character;

    // 同步写入全局角色库（让新对话和选择器立即拿到最新版本）
    if (character.name) {
        const key = character.name.trim().toLowerCase();
        if (!state.characters) state.characters = {};
        state.characters[key] = JSON.parse(JSON.stringify(character));
    }

    if (wasNew && character.first_mes && conv.messages.length === 0) {
        var charName = character.name;
        var userName = state.settings.userName || 'User';
        var firstMes = replacePlaceholders(character.first_mes, charName, userName);
        if (firstMes) conv.messages.push({ role: 'assistant', content: firstMes });
    }

    if (conv.title === t('title_new_chat_match') || conv.title === t('new_chat_title') || (wasNew && conv.title.indexOf(t('chat_with')) === 0)) {
        conv.title = t('chat_with') + character.name;
    }
    conv.updated = Date.now();
    persistState();

    // 让卡片库立刻反映新建/编辑的角色
    if (typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }

    dom.charEditorModal.classList.add('hidden');

    // 角色信息变更后显式触发相关渲染
    renderCharacterUI();
    renderMessagesOnly();
    renderConversationListOnly();
    appStore.notify('conversations'); // 对话列表可能显示角色名
}

function exportCharacter() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    if (!c) return;

    var card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: c.name,
            description: c.description,
            personality: c.personality,
            scenario: c.scenario,
            first_mes: c.first_mes,
            mes_example: c.mes_example,
            system_prompt: c.system_prompt,
            post_history_instructions: c.post_history_instructions,
            creator_notes: c.creator_notes,
            tags: c.tags || [],
            creator: '',
            character_version: '1.0',
            alternate_greetings: c.alternate_greetings || [],
            extensions: {}
        },
        create_date: new Date().toISOString()
    };

    // 自动嵌入当前对话已关联的世界书（character_book）
    var characterBook = getCharacterBookForExport(conv);
    if (characterBook) {
        card.data.character_book = characterBook;

        // 设置 extensions.world 提高与 SillyTavern 等工具的兼容性
        if (!card.data.extensions) card.data.extensions = {};
        if (characterBook.name) {
            card.data.extensions.world = characterBook.name;
        }
    }

    // 可选提示（控制台 + 可能的状态区域）
    if (characterBook) {
        console.log('[Character Export] 已自动嵌入 character_book，共 ' + characterBook.entries.length + ' 条目');
    }

    var blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (c.name || 'character').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '_card.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
