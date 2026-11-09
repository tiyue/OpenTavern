// Quick reply groups are portable settings; sending always goes through the normal composer/send path.
var QUICK_REPLY_SCOPES = ['global', 'character', 'conversation'];
var QUICK_REPLY_ACTIONS = ['insert', 'send'];
var QUICK_REPLY_MAX_GROUPS = 40;
var QUICK_REPLY_MAX_BUTTONS = 60;
var QUICK_REPLY_MAX_CONTENT = 5000;
var failedQuickReplyDraft = null;

function normalizeQuickReplyScope(value) {
    value = String(value || '').toLowerCase();
    return QUICK_REPLY_SCOPES.indexOf(value) >= 0 ? value : 'global';
}

function normalizeQuickReplyAction(value) {
    return String(value || '').toLowerCase() === 'send' ? 'send' : 'insert';
}

function normalizeQuickReplyButton(button, index, usedIds) {
    if (!button || typeof button !== 'object' || Array.isArray(button)) return null;
    var id = String(button.id || '').trim();
    if (!id || usedIds[id]) id = 'quick-reply-button-' + Date.now().toString(36) + '-' + index;
    usedIds[id] = true;
    var name = String(button.name || '').trim().slice(0, 80);
    var content = String(button.content || '').slice(0, QUICK_REPLY_MAX_CONTENT);
    if (!name || !content.trim()) return null;
    return {
        id: id, name: name, content: content,
        action: normalizeQuickReplyAction(button.action),
        enabled: button.enabled !== false,
        order: Number.isFinite(Number(button.order)) ? Number(button.order) : index
    };
}

function normalizeQuickReplyGroup(group, index, usedIds) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
    var id = String(group.id || '').trim();
    if (!id || usedIds[id]) id = 'quick-reply-group-' + Date.now().toString(36) + '-' + index;
    usedIds[id] = true;
    var scope = normalizeQuickReplyScope(group.scope);
    var buttonIds = Object.create(null);
    var buttons = (Array.isArray(group.buttons) ? group.buttons : []).slice(0, QUICK_REPLY_MAX_BUTTONS).map(function(button, buttonIndex) {
        return normalizeQuickReplyButton(button, buttonIndex, buttonIds);
    }).filter(Boolean).sort(function(a, b) { return a.order - b.order; });
    return {
        id: id,
        name: String(group.name || '').trim().slice(0, 120) || t('quick_reply_unnamed_group'),
        enabled: group.enabled !== false,
        scope: scope,
        targetId: scope === 'global' ? '' : String(group.targetId || '').trim().slice(0, 200),
        order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
        buttons: buttons
    };
}

function ensureQuickReplyGroups(settings) {
    settings = settings || state.settings;
    if (!settings || typeof settings !== 'object') return [];
    if (!Array.isArray(settings.quickReplyGroups)) settings.quickReplyGroups = [];
    var usedIds = Object.create(null);
    settings.quickReplyGroups = settings.quickReplyGroups.slice(0, QUICK_REPLY_MAX_GROUPS).map(function(group, index) {
        return normalizeQuickReplyGroup(group, index, usedIds);
    }).filter(Boolean).sort(function(a, b) { return a.order - b.order; });
    settings.quickReplyGroups.forEach(function(group, index) { group.order = index; });
    return settings.quickReplyGroups;
}

function validateQuickReplyGroup(group) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(t('quick_reply_invalid_group'));
    if (!String(group.name || '').trim()) throw new Error(t('quick_reply_name_required'));
    if (QUICK_REPLY_SCOPES.indexOf(group.scope) < 0) throw new Error(t('quick_reply_scope_invalid'));
    if (group.scope !== 'global' && !String(group.targetId || '').trim()) throw new Error(t('quick_reply_target_required'));
    if (!Array.isArray(group.buttons) || group.buttons.length > QUICK_REPLY_MAX_BUTTONS) throw new Error(t('quick_reply_buttons_invalid'));
    group.buttons.forEach(function(button) {
        if (!String(button.name || '').trim()) throw new Error(t('quick_reply_button_name_required'));
        if (!String(button.content || '').trim()) throw new Error(t('quick_reply_button_content_required'));
        if (String(button.content).length > QUICK_REPLY_MAX_CONTENT) throw new Error(t('quick_reply_button_content_long'));
        if (QUICK_REPLY_ACTIONS.indexOf(button.action) < 0) throw new Error(t('quick_reply_action_invalid'));
    });
    return group;
}

function quickReplyTargetNames(conv) {
    var names = [];
    if (conv && conv.character && conv.character.name) names.push(String(conv.character.name).toLowerCase());
    if (conv && conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach(function(member) {
            if (member && member.character && member.character.name) names.push(String(member.character.name).toLowerCase());
        });
    }
    return Array.from(new Set(names));
}

function quickReplyGroupMatchesConversation(group, conv) {
    if (!group || group.enabled === false) return false;
    if (group.scope === 'global') return true;
    if (!conv) return false;
    if (group.scope === 'conversation') return group.targetId === conv.id;
    return quickReplyTargetNames(conv).indexOf(String(group.targetId || '').toLowerCase()) >= 0;
}

function getConversationDisabledQuickReplyGroupIds(conv) {
    return Array.isArray(conv && conv.quickReplyDisabledGroupIds) ? conv.quickReplyDisabledGroupIds : [];
}

function getActiveQuickReplyGroups(conv) {
    ensureQuickReplyGroups();
    var disabled = new Set(getConversationDisabledQuickReplyGroupIds(conv));
    return (state.settings.quickReplyGroups || []).filter(function(group) {
        return quickReplyGroupMatchesConversation(group, conv) && !disabled.has(group.id);
    }).sort(function(a, b) { return a.order - b.order; });
}

function getActiveQuickReplyButtons(conv) {
    var result = [];
    getActiveQuickReplyGroups(conv).forEach(function(group) {
        group.buttons.filter(function(button) { return button.enabled !== false; }).slice().sort(function(a, b) { return a.order - b.order; }).forEach(function(button) {
            result.push({ groupId: group.id, groupName: group.name, button: button });
        });
    });
    return result;
}

function expandQuickReplyText(text, conv) {
    var value = String(text || '');
    if (typeof replacePlaceholders !== 'function') return value;
    var character = conv && conv.character;
    return replacePlaceholders(value, character && character.name || '', state.settings.userName || 'User');
}

function mergeQuickReplyIntoComposerText(existing, addition, mode) {
    existing = String(existing || '');
    addition = String(addition || '');
    if (!existing.trim() || mode === 'replace') return addition;
    return existing.replace(/\s*$/, '') + '\n' + addition;
}

async function toggleConversationQuickReplyGroup(conv, groupId, disabled) {
    if (!isLiveConversation(conv) || getActiveConv() !== conv) throw new Error(t('quick_reply_wrong_conversation'));
    var before = getConversationDisabledQuickReplyGroupIds(conv).slice();
    var next = before.filter(function(id) { return id !== groupId; });
    if (disabled) next.push(groupId);
    if (JSON.stringify(before) === JSON.stringify(next)) return false;
    var candidate = Object.assign({}, conv, { quickReplyDisabledGroupIds: next, updated: Date.now() });
    await persistConversationMutation(conv, function() {}, candidate, function(current, validateOnly) {
        if (JSON.stringify(getConversationDisabledQuickReplyGroupIds(current)) !== JSON.stringify(before)) return false;
        if (!validateOnly) { current.quickReplyDisabledGroupIds = next.slice(); current.updated = candidate.updated; }
        return true;
    });
    return true;
}

async function saveQuickReplyGroupsChange(mutator) {
    if (failedQuickReplyDraft) throw new Error(t('quick_reply_draft_pending'));
    var root = state.settings;
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureQuickReplyGroups(candidate);
    mutator(candidate, candidate.quickReplyGroups);
    ensureQuickReplyGroups(candidate);
    candidate.quickReplyGroups.forEach(validateQuickReplyGroup);
    var baseline = JSON.stringify(state.settings.quickReplyGroups);
    function check() {
        if (state.settings !== root) throw new Error(t('quick_reply_settings_replaced'));
        if (JSON.stringify(state.settings.quickReplyGroups) !== baseline) throw new Error(t('quick_reply_settings_changed'));
    }
    try {
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: check,
            transformSnapshot: function(snapshot) {
                snapshot.settings.quickReplyGroups = JSON.parse(JSON.stringify(candidate.quickReplyGroups));
                return snapshot;
            },
            onPersistSuccess: function() {
                check();
                state.settings.quickReplyGroups = JSON.parse(JSON.stringify(candidate.quickReplyGroups));
            },
            commitPendingSnapshot: function(snapshot) {
                if (JSON.stringify(snapshot.settings && snapshot.settings.quickReplyGroups) === baseline) {
                    snapshot.settings.quickReplyGroups = JSON.parse(JSON.stringify(candidate.quickReplyGroups));
                }
            }
        });
        failedQuickReplyDraft = null;
        if (typeof renderQuickReplyBar === 'function') renderQuickReplyBar();
        appStore.notify('settings');
        return true;
    } catch (error) {
        failedQuickReplyDraft = { candidate: candidate, root: root, baseline: baseline };
        throw error;
    }
}

function importQuickReplyGroupsData(raw) {
    var groups = Array.isArray(raw) ? raw : raw && raw.type === 'opentavern-quick-replies' ? raw.groups : null;
    if (!Array.isArray(groups) || !groups.length || groups.length > QUICK_REPLY_MAX_GROUPS) throw new Error(t('quick_reply_import_invalid'));
    var usedIds = Object.create(null);
    return groups.map(function(rawGroup, index) {
        var copy = JSON.parse(JSON.stringify(rawGroup));
        copy.id = '';
        copy.order = index;
        copy.buttons = Array.isArray(copy.buttons) ? copy.buttons.map(function(button, buttonIndex) {
            var buttonCopy = JSON.parse(JSON.stringify(button));
            buttonCopy.id = '';
            buttonCopy.action = 'insert';
            buttonCopy.order = buttonIndex;
            return buttonCopy;
        }) : [];
        var group = normalizeQuickReplyGroup(copy, index, usedIds);
        if (!group) throw new Error(t('quick_reply_import_invalid'));
        group.buttons.forEach(function(button) { button.action = 'insert'; });
        validateQuickReplyGroup(group);
        return group;
    });
}

function exportQuickReplyGroupsData() {
    ensureQuickReplyGroups();
    return {
        type: 'opentavern-quick-replies',
        version: 1,
        groups: state.settings.quickReplyGroups.map(function(group) {
            return JSON.parse(JSON.stringify(group));
        })
    };
}

function cloneQuickReplyGroupForCopy(group) {
    var copy = JSON.parse(JSON.stringify(group));
    copy.id = makeId();
    copy.name = (group.name || t('quick_reply_unnamed_group')) + ' ' + t('quick_reply_copy_suffix');
    copy.buttons.forEach(function(button) { button.id = makeId(); });
    copy.order = (state.settings.quickReplyGroups || []).length;
    return copy;
}
