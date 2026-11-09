// Composer buttons and the secondary quick-reply manager.
var quickReplySendInProgress = false;

function renderQuickReplyBar() {
    var host = document.getElementById('quickReplyBar');
    if (!host) return;
    host.replaceChildren();
    host.setAttribute('aria-label', t('quick_reply_manager_title'));
    var items = getActiveQuickReplyButtons(getActiveConv());
    host.hidden = !items.length;
    items.forEach(function(item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'quick-reply-chip' + (item.button.action === 'send' ? ' quick-reply-chip-send' : '');
        button.textContent = item.button.name;
        button.title = item.groupName + (item.button.action === 'send' ? ' · ' + t('quick_reply_direct_send') : ' · ' + t('quick_reply_insert'));
        button.disabled = state.isGenerating || composerSendInProgress;
        button.dataset.quickReplyGroup = item.groupId;
        button.dataset.quickReplyButton = item.button.id;
        button.setAttribute('aria-label', item.button.name + ' · ' + (item.button.action === 'send' ? t('quick_reply_direct_send') : t('quick_reply_insert')));
        button.onclick = function() {
            if (item.button.action === 'send') directSendQuickReply(item).catch(function(error) { alert(error.message); });
            else {
                try { insertQuickReplyText(item); } catch (error) { alert(error.message); }
            }
        };
        host.appendChild(button);
    });
}

function applyQuickReplyComposerText(conv, text, mode) {
    if (!isLiveConversation(conv) || getActiveConv() !== conv) throw new Error(t('quick_reply_wrong_conversation'));
    if (state.isGenerating || composerSendInProgress) throw new Error(t('quick_reply_generation_busy'));
    syncComposerConversation();
    var draft = getComposerDraft(conv);
    var next = mergeQuickReplyIntoComposerText(dom.messageInput.value, text, mode);
    dom.messageInput.value = next;
    draft.text = next;
    draft.revision++;
    if (typeof cancelUserDraft === 'function') cancelUserDraft();
    dom.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    dom.messageInput.focus();
    return next;
}

function insertQuickReplyText(item) {
    var conv = getActiveConv();
    if (!conv) throw new Error(t('quick_reply_no_conversation'));
    applyQuickReplyComposerText(conv, expandQuickReplyText(item.button.content, conv), 'append');
}

function quickReplyConversationBusy(conv) {
    if (state.isGenerating || composerSendInProgress || quickReplySendInProgress) return true;
    if (!conv || conv._messageCommitInProgress) return true;
    if (typeof isBackupRestorePending === 'function' && isBackupRestorePending()) return true;
    if (typeof cloudSyncActiveOperations !== 'undefined' && cloudSyncActiveOperations > 0) return true;
    return typeof _persistPendingRecords !== 'undefined' && _persistPendingRecords.some(function(record) { return record.status === 'running'; });
}

function chooseQuickReplyDraftMode() {
    return new Promise(function(resolve) {
        var dialog = openFeatureDialog('quickReplyDraftChoice', t('quick_reply_draft_title'),
            '<p class="feature-hint">' + escapeHtml(t('quick_reply_draft_hint')) + '</p>' +
            '<div class="feature-toolbar"><button type="button" data-quick-reply-mode="append">' + escapeHtml(t('quick_reply_append')) + '</button>' +
            '<button type="button" data-quick-reply-mode="replace">' + escapeHtml(t('quick_reply_replace')) + '</button></div>', null, {
                onClose: function() { resolve(null); }
            });
        dialog.addEventListener('click', function(event) {
            var button = event.target.closest('[data-quick-reply-mode]');
            if (!button) return;
            var mode = button.dataset.quickReplyMode;
            dialog.close();
            resolve(mode);
        });
    });
}

async function directSendQuickReply(item) {
    if (quickReplySendInProgress) return;
    var conv = getActiveConv();
    if (!conv) throw new Error(t('quick_reply_no_conversation'));
    if (quickReplyConversationBusy(conv)) throw new Error(t('quick_reply_send_busy'));
    if (!state.settings.apiEndpoint || !state.settings.apiKey) throw new Error(t('no_api_error'));
    var text = expandQuickReplyText(item.button.content, conv);
    if (!text.trim()) throw new Error(t('quick_reply_button_content_required'));
    syncComposerConversation();
    var current = dom.messageInput.value;
    quickReplySendInProgress = true;
    try {
        var mode = 'append';
        if (current.trim()) mode = await chooseQuickReplyDraftMode();
        if (!mode) return;
        applyQuickReplyComposerText(conv, text, mode);
        await sendMessage();
    } finally {
        quickReplySendInProgress = false;
    }
}

function quickReplyScopeChoices() {
    var conv = getActiveConv();
    var characterTargets = [];
    Object.keys(state.characters || {}).forEach(function(key) {
        var character = state.characters[key];
        if (character && character.name) characterTargets.push([String(character.name).toLowerCase(), character.name]);
    });
    if (conv && conv.character && conv.character.name && !characterTargets.some(function(item) { return item[0] === String(conv.character.name).toLowerCase(); })) {
        characterTargets.push([String(conv.character.name).toLowerCase(), conv.character.name]);
    }
    var conversationTargets = getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations).map(function(id) {
        return [id, state.conversations[id] && state.conversations[id].title || id];
    });
    return { character: characterTargets, conversation: conversationTargets };
}

function quickReplyTargetOptions(scope, selected) {
    var choices = quickReplyScopeChoices()[scope] || [];
    if (selected && !choices.some(function(item) { return item[0] === selected; })) choices = [[selected, selected]].concat(choices);
    return choices;
}

function openQuickReplyGroupEditor(group) {
    var isNew = !group;
    var working = group ? JSON.parse(JSON.stringify(group)) : {
        id: makeId(), name: '', enabled: true, scope: 'global', targetId: '', order: (state.settings.quickReplyGroups || []).length, buttons: []
    };
    var dialog = openFeatureDialog('quickReplyGroupEditor', isNew ? t('quick_reply_new_group') : t('quick_reply_edit_group'),
        featureField(t('quick_reply_group_name'), 'quickReplyGroupName', working.name) +
        featureSelect(t('quick_reply_scope'), 'quickReplyGroupScope', working.scope, [
            ['global', t('quick_reply_scope_global')], ['character', t('quick_reply_scope_character')], ['conversation', t('quick_reply_scope_conversation')]
        ]) +
        '<div id="quickReplyTargetField"></div>' +
        '<label class="feature-check"><input id="quickReplyGroupEnabled" type="checkbox"' + (working.enabled ? ' checked' : '') + '>' + escapeHtml(t('quick_reply_enabled')) + '</label>' +
        '<div class="feature-toolbar"><button type="button" data-quick-button-new>' + escapeHtml(t('quick_reply_new_button')) + '</button></div>' +
        '<div data-quick-buttons></div>', async function(editor) {
            working.name = editor.querySelector('#quickReplyGroupName').value.trim();
            working.scope = normalizeQuickReplyScope(editor.querySelector('#quickReplyGroupScope').value);
            var target = editor.querySelector('#quickReplyGroupTarget');
            working.targetId = working.scope === 'global' ? '' : target && target.value || '';
            working.enabled = editor.querySelector('#quickReplyGroupEnabled').checked;
            working.buttons.forEach(function(button, index) { button.order = index; });
            validateQuickReplyGroup(working);
            await saveQuickReplyGroupsChange(function(candidate, groups) {
                var index = groups.findIndex(function(item) { return item.id === working.id; });
                if (index >= 0) groups[index] = JSON.parse(JSON.stringify(working));
                else groups.push(JSON.parse(JSON.stringify(working)));
            });
            refreshQuickReplyManager();
        }, { lockWhileSaving: true });
    function renderTarget() {
        var host = dialog.querySelector('#quickReplyTargetField');
        var scope = dialog.querySelector('#quickReplyGroupScope').value;
        if (scope === 'global') { host.innerHTML = ''; return; }
        var choices = quickReplyTargetOptions(scope, working.targetId);
        host.innerHTML = featureSelect(scope === 'character' ? t('quick_reply_target_character') : t('quick_reply_target_conversation'),
            'quickReplyGroupTarget', working.targetId, choices.length ? choices : [['', t('quick_reply_target_unavailable')]]);
    }
    function renderButtons() {
        dialog.querySelector('[data-quick-buttons]').innerHTML = working.buttons.map(function(button, index) {
            return '<div class="feature-row"><span><strong>' + escapeHtml(button.name) + '</strong><small>' +
                escapeHtml(button.action === 'send' ? t('quick_reply_direct_send') : t('quick_reply_insert')) + (button.enabled === false ? ' · ' + escapeHtml(t('quick_reply_disabled')) : '') + '</small></span>' +
                '<button type="button" data-quick-button-edit="' + index + '">' + escapeHtml(t('quick_reply_edit')) + '</button>' +
                '<button type="button" data-quick-button-move="' + index + '" data-direction="-1"' + (index === 0 ? ' disabled' : '') + '>' + escapeHtml(t('quick_reply_move_up')) + '</button>' +
                '<button type="button" data-quick-button-move="' + index + '" data-direction="1"' + (index === working.buttons.length - 1 ? ' disabled' : '') + '>' + escapeHtml(t('quick_reply_move_down')) + '</button>' +
                '<button type="button" data-quick-button-delete="' + index + '">' + escapeHtml(t('quick_reply_delete')) + '</button></div>';
        }).join('') || '<p class="feature-hint">' + escapeHtml(t('quick_reply_no_buttons')) + '</p>';
    }
    dialog.querySelector('#quickReplyGroupScope').onchange = renderTarget;
    dialog.addEventListener('click', function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-quick-button-new')) openQuickReplyButtonEditor(null, function(created) { working.buttons.push(created); renderButtons(); });
        if (button.dataset.quickButtonEdit != null) {
            var editIndex = Number(button.dataset.quickButtonEdit);
            openQuickReplyButtonEditor(working.buttons[editIndex], function(updated) { working.buttons[editIndex] = updated; renderButtons(); });
        }
        if (button.dataset.quickButtonDelete != null) {
            working.buttons.splice(Number(button.dataset.quickButtonDelete), 1); renderButtons();
        }
        if (button.dataset.quickButtonMove != null) {
            var from = Number(button.dataset.quickButtonMove), to = from + Number(button.dataset.direction);
            if (to >= 0 && to < working.buttons.length) {
                var moved = working.buttons.splice(from, 1)[0];
                working.buttons.splice(to, 0, moved);
                working.buttons.forEach(function(item, index) { item.order = index; });
                renderButtons();
            }
        }
    });
    renderTarget(); renderButtons();
}

function openQuickReplyButtonEditor(button, onSave) {
    var working = button ? JSON.parse(JSON.stringify(button)) : { id: makeId(), name: '', content: '', action: 'insert', enabled: true, order: 0 };
    openFeatureDialog('quickReplyButtonEditor', button ? t('quick_reply_edit_button') : t('quick_reply_new_button'),
        featureField(t('quick_reply_button_name'), 'quickReplyButtonName', working.name) +
        featureField(t('quick_reply_button_content'), 'quickReplyButtonContent', working.content, 'textarea', 'rows="8"') +
        featureSelect(t('quick_reply_button_action'), 'quickReplyButtonAction', working.action, [
            ['insert', t('quick_reply_insert_only')], ['send', t('quick_reply_send_directly')]
        ]) +
        '<p class="feature-hint">' + escapeHtml(t('quick_reply_macro_hint')) + '</p>' +
        '<label class="feature-check"><input id="quickReplyButtonEnabled" type="checkbox"' + (working.enabled ? ' checked' : '') + '>' + escapeHtml(t('quick_reply_enabled')) + '</label>', async function(dialog) {
            working.name = dialog.querySelector('#quickReplyButtonName').value.trim();
            working.content = dialog.querySelector('#quickReplyButtonContent').value;
            working.action = normalizeQuickReplyAction(dialog.querySelector('#quickReplyButtonAction').value);
            working.enabled = dialog.querySelector('#quickReplyButtonEnabled').checked;
            if (!working.name || !working.content.trim()) throw new Error(t('quick_reply_button_content_required'));
            onSave(working);
        }, { lockWhileSaving: true });
}

function refreshQuickReplyManager() {
    var dialog = document.getElementById('quickReplyManager');
    if (!dialog) return;
    ensureQuickReplyGroups();
    var conv = getActiveConv();
    var disabled = new Set(getConversationDisabledQuickReplyGroupIds(conv));
    dialog.querySelector('[data-quick-groups]').innerHTML = state.settings.quickReplyGroups.map(function(group) {
        return '<div class="feature-row"><span><strong>' + escapeHtml(group.name) + (group.enabled === false ? ' · ' + escapeHtml(t('quick_reply_disabled')) : '') + '</strong>' +
            '<small>' + escapeHtml(quickReplyScopeLabel(group)) + ' · ' + group.buttons.length + ' ' + escapeHtml(t('quick_reply_buttons_count')) + '</small></span>' +
            '<label class="feature-check"><input type="checkbox" data-quick-group-enabled="' + escapeHtml(group.id) + '"' + (group.enabled !== false ? ' checked' : '') + '>' + escapeHtml(t('quick_reply_enabled')) + '</label>' +
            (conv && group.scope !== 'conversation' ? '<label class="feature-check"><input type="checkbox" data-quick-group-conversation="' + escapeHtml(group.id) + '"' + (disabled.has(group.id) ? ' checked' : '') + '>' + escapeHtml(t('quick_reply_disabled_here')) + '</label>' : '') +
            '<button type="button" data-quick-group-edit="' + escapeHtml(group.id) + '">' + escapeHtml(t('quick_reply_edit')) + '</button>' +
            '<button type="button" data-quick-group-copy="' + escapeHtml(group.id) + '">' + escapeHtml(t('quick_reply_copy')) + '</button>' +
            '<button type="button" data-quick-group-move="' + escapeHtml(group.id) + '" data-direction="-1">' + escapeHtml(t('quick_reply_move_up')) + '</button>' +
            '<button type="button" data-quick-group-move="' + escapeHtml(group.id) + '" data-direction="1">' + escapeHtml(t('quick_reply_move_down')) + '</button>' +
            '<button type="button" data-quick-group-delete="' + escapeHtml(group.id) + '">' + escapeHtml(t('quick_reply_delete')) + '</button></div>';
    }).join('') || '<p class="feature-hint">' + escapeHtml(t('quick_reply_empty')) + '</p>';
    var recovery = dialog.querySelector('#quickReplyDraftRecovery');
    if (recovery) recovery.remove();
    if (failedQuickReplyDraft) {
        recovery = document.createElement('div');
        recovery.id = 'quickReplyDraftRecovery';
        recovery.className = 'feature-inline';
        var note = document.createElement('span'); note.textContent = t('quick_reply_draft_pending');
        var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = t('quick_reply_retry');
        retry.onclick = async function() { retry.disabled = true; try { var draft = failedQuickReplyDraft; failedQuickReplyDraft = null; await saveQuickReplyGroupsChange(function(candidate) { candidate.quickReplyGroups = JSON.parse(JSON.stringify(draft.candidate.quickReplyGroups)); }); refreshQuickReplyManager(); } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; retry.disabled = false; } };
        var discard = document.createElement('button'); discard.type = 'button'; discard.textContent = t('quick_reply_discard');
        discard.onclick = function() { failedQuickReplyDraft = null; refreshQuickReplyManager(); };
        recovery.append(note, retry, discard);
        dialog.querySelector('[data-quick-groups]').before(recovery);
    }
}

function quickReplyScopeLabel(group) {
    if (group.scope === 'global') return t('quick_reply_scope_global');
    if (group.scope === 'conversation') return t('quick_reply_scope_conversation') + ' · ' + (state.conversations[group.targetId] && state.conversations[group.targetId].title || group.targetId);
    var character = state.characters && state.characters[group.targetId];
    return t('quick_reply_scope_character') + ' · ' + (character && character.name || group.targetId);
}

function openQuickReplyManager() {
    var dialog = openFeatureDialog('quickReplyManager', t('quick_reply_manager_title'),
        '<p class="feature-hint">' + escapeHtml(t('quick_reply_manager_hint')) + '</p>' +
        '<div class="feature-toolbar"><button type="button" data-quick-group-new>' + escapeHtml(t('quick_reply_new_group')) + '</button>' +
        '<button type="button" data-quick-import>' + escapeHtml(t('quick_reply_import')) + '</button>' +
        '<button type="button" data-quick-export>' + escapeHtml(t('quick_reply_export')) + '</button></div>' +
        '<input id="quickReplyImportFile" type="file" accept=".json,application/json" hidden>' +
        '<div data-quick-groups></div>', null);
    dialog.addEventListener('click', async function(event) {
        var checkbox = event.target.closest('[data-quick-group-enabled]');
        if (checkbox) {
            try {
                await saveQuickReplyGroupsChange(function(candidate, groups) {
                    var group = groups.find(function(item) { return item.id === checkbox.dataset.quickGroupEnabled; });
                    if (group) group.enabled = checkbox.checked;
                });
            } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
            refreshQuickReplyManager();
            return;
        }
        var conversationCheckbox = event.target.closest('[data-quick-group-conversation]');
        if (conversationCheckbox) {
            try { await toggleConversationQuickReplyGroup(getActiveConv(), conversationCheckbox.dataset.quickGroupConversation, conversationCheckbox.checked); }
            catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
            refreshQuickReplyManager();
            renderQuickReplyBar();
            return;
        }
        var button = event.target.closest('button');
        if (!button) return;
        var groups = state.settings.quickReplyGroups || [];
        try {
            if (button.hasAttribute('data-quick-group-new')) openQuickReplyGroupEditor(null);
            if (button.hasAttribute('data-quick-import')) dialog.querySelector('#quickReplyImportFile').click();
            if (button.hasAttribute('data-quick-export')) downloadJsonFile(exportQuickReplyGroupsData(), 'opentavern-quick-replies.json');
            if (button.dataset.quickGroupEdit) openQuickReplyGroupEditor(groups.find(function(group) { return group.id === button.dataset.quickGroupEdit; }));
            if (button.dataset.quickGroupCopy) {
                var copy = cloneQuickReplyGroupForCopy(groups.find(function(group) { return group.id === button.dataset.quickGroupCopy; }));
                await saveQuickReplyGroupsChange(function(candidate, target) { target.push(copy); });
            }
            if (button.dataset.quickGroupDelete && await confirmFeatureAction(t('quick_reply_delete_confirm'), t('quick_reply_delete'))) {
                await saveQuickReplyGroupsChange(function(candidate, target) {
                    candidate.quickReplyGroups = target.filter(function(group) { return group.id !== button.dataset.quickGroupDelete; });
                });
            }
            if (button.dataset.quickGroupMove) {
                await saveQuickReplyGroupsChange(function(candidate, target) {
                    var from = target.findIndex(function(group) { return group.id === button.dataset.quickGroupMove; });
                    var to = from + Number(button.dataset.direction);
                    if (from < 0 || to < 0 || to >= target.length) return;
                    var moved = target.splice(from, 1)[0];
                    target.splice(to, 0, moved);
                });
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
        refreshQuickReplyManager();
        renderQuickReplyBar();
    });
    dialog.querySelector('#quickReplyImportFile').onchange = async function(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            var imported = importQuickReplyGroupsData(JSON.parse(await file.text()));
            await saveQuickReplyGroupsChange(function(candidate, target) { imported.forEach(function(group) { target.push(group); }); });
            refreshQuickReplyManager();
            renderQuickReplyBar();
        } catch (error) { dialog.querySelector('.feature-error').textContent = error.message; }
    };
    refreshQuickReplyManager();
}

function addQuickReplyChatEntry(parent) {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'quickReplyEntry';
    button.className = 'feature-entry feature-entry-compact';
    button.textContent = t('quick_reply_manager_entry');
    button.onclick = openQuickReplyManager;
    parent.appendChild(button);
}

function bindQuickReplyEvents() {
    renderQuickReplyBar();
    if (typeof appStore !== 'undefined' && appStore.subscribe) {
        appStore.subscribe(function() { renderQuickReplyBar(); });
    }
}
