// ==================== Conversation Export / Import ====================
function exportConversation(id) {
    var conv = state.conversations[id];
    if (!conv) return;
    downloadJsonFile(
        { version: 1, type: 'opentavern-export', exported_at: new Date().toISOString(), conversations: [conv] },
        (conv.title || 'conversation').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '.json'
    );
}

function exportAllConversations() {
    var convs = state.conversationOrder.map(function(id) { return state.conversations[id]; }).filter(Boolean);
    if (convs.length === 0) { alert(t('nothing_to_archive')); return; }

    // 【Export Fix】导出完整备份：包含全局角色卡库、WorldBook、对话等
    // 旧格式仍兼容（只导 conversations），新格式带完整数据
    var exportData = {
        version: 2,
        type: 'opentavern-full-export',
        exported_at: new Date().toISOString(),
        settings: getSafeSettingsForPersist(),
        conversations: convs,
        conversationOrder: state.conversationOrder || [],
        characters: state.characters || {},          // 全局卡片库
        worldBooks: state.worldBooks || {},
        charactersMigrated: !!state._charactersMigrated
    };

    downloadJsonFile(
        exportData,
        'opentavern_all_' + new Date().toISOString().slice(0, 10) + '.json'
    );
    recordBackupMade();
}

function downloadJsonFile(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importConversations(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var data = JSON.parse(ev.target.result);

            // 支持旧格式 (type: opentavern-export) 和新完整格式 (type: opentavern-full-export)
            var convsToImport = [];
            if (data && Array.isArray(data.conversations)) {
                convsToImport = data.conversations;
            } else {
                alert(t('import_conv_error'));
                return;
            }

            // 额外校验：必须至少有一个有效对话
            if (convsToImport.length === 0) {
                alert(t('import_conv_error'));
                return;
            }

            var imported = 0;
            var skipped = 0;

            convsToImport.forEach(function(conv) {
                if (!conv.id || !Array.isArray(conv.messages)) return;

                // If a conversation with this ID already exists, generate a new ID
                if (state.conversations[conv.id]) {
                    conv.id = makeId();
                    skipped++;
                }
                state.conversations[conv.id] = conv;

                // Avoid duplicates in the order list
                if (state.conversationOrder.indexOf(conv.id) === -1) {
                    state.conversationOrder.unshift(conv.id);
                }
                imported++;
            });

            // 【Import Fix】导入后必须把角色卡注册到全局库（state.characters），否则我的卡片库不显示
            // 1. 如果导出里带了顶层 characters，直接合并
            if (data.characters && typeof data.characters === 'object') {
                if (!state.characters) state.characters = {};
                Object.keys(data.characters).forEach(function(key) {
                    if (!state.characters[key]) {
                        state.characters[key] = JSON.parse(JSON.stringify(data.characters[key]));
                    }
                });
            }

            // 2. 从导入的对话里提取角色卡（单聊 + 群聊），注册到全局库
            // 复用 migrate 逻辑，确保和启动时行为一致
            if (typeof migrateCharactersToRegistry === 'function') {
                migrateCharactersToRegistry(convsToImport);
            } else {
                // 兜底：手动注册
                if (!state.characters) state.characters = {};
                convsToImport.forEach(function(conv) {
                    if (conv.character && conv.character.name) {
                        const key = conv.character.name.trim().toLowerCase();
                        if (!state.characters[key]) {
                            state.characters[key] = JSON.parse(JSON.stringify(conv.character));
                        }
                    }
                    if (conv.group && Array.isArray(conv.group.members)) {
                        conv.group.members.forEach(function(m) {
                            const ch = m && m.character;
                            if (ch && ch.name) {
                                const key = ch.name.trim().toLowerCase();
                                if (!state.characters[key]) {
                                    state.characters[key] = JSON.parse(JSON.stringify(ch));
                                }
                            }
                        });
                    }
                });
            }

            if (imported > 0) {
                // 同时恢复 worldBooks 如果有
                if (data.worldBooks && typeof data.worldBooks === 'object') {
                    if (!state.worldBooks) state.worldBooks = {};
                    Object.keys(data.worldBooks).forEach(function(wbId) {
                        if (!state.worldBooks[wbId]) {
                            state.worldBooks[wbId] = JSON.parse(JSON.stringify(data.worldBooks[wbId]));
                        }
                    });
                }

                persistState(true);
                if (typeof updateStorageInfo === 'function') updateStorageInfo();

                // 关键：立即刷新“我的卡片”库，让用户看到导入的角色卡
                if (typeof renderLibraryGrids === 'function') {
                    renderLibraryGrids();
                }
                if (typeof renderMyCards === 'function') {
                    renderMyCards();
                }

                // 切换到第一条导入的对话（或保持当前）
                if (!state.activeConvId && state.conversationOrder.length > 0) {
                    state.activeConvId = state.conversationOrder[0];
                }
                persistState(true);
                requestRender('activeConvId');
            }

            var msg = t('import_conv_success') + imported + t('import_conv_success_suffix');
            if (skipped > 0) msg += ' ' + skipped + t('import_conv_duplicate');
            alert(msg);
        } catch(e) {
            console.error('[Import] failed:', e);
            alert(t('import_conv_error'));
        }
    };
    reader.readAsText(file);
}
