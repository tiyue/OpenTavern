// ==================== Character Panel Helpers ====================
const CHARACTER_PANEL_AVATAR_FILL_CLASS = 'w-7 h-7 rounded-lg ot-avatar-fill flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0';
const CHARACTER_PANEL_IMAGE_AVATAR_CLASS = 'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';

function setCharacterPanelCardVisible(visible) {
    if (dom.charCardPreview) dom.charCardPreview.classList[visible ? 'remove' : 'add']('hidden');
    if (dom.charCardEmptyHint) dom.charCardEmptyHint.classList[visible ? 'add' : 'remove']('hidden');
}

function setCharacterPanelActionButtonsVisible(visible) {
    ['charEditBtn', 'charExportBtn', 'charRemoveBtn'].forEach(function(key) {
        if (dom[key]) dom[key].classList[visible ? 'remove' : 'add']('hidden');
    });
}

function renderCharacterPanelEmptyState() {
    setCharacterPanelCardVisible(false);
    setCharacterPanelActionButtonsVisible(false);
}

function buildGroupCharacterSummary(members) {
    var shortList = members
        .map(function(member) { return (member.character && member.character.name) ? member.character.name : ''; })
        .filter(Boolean)
        .slice(0, 2)
        .join('、');
    var more = members.length > 2 ? ' 等' : '';
    return members.length + ' 角色' + (shortList ? ' · ' + shortList + more : '');
}

function renderGroupCharacterPanel(conv) {
    setCharacterPanelCardVisible(true);
    setCharacterPanelActionButtonsVisible(false);

    var members = getGroupMembers(conv);
    if (dom.charCardAvatar) {
        dom.charCardAvatar.textContent = 'Group';
        dom.charCardAvatar.className = CHARACTER_PANEL_AVATAR_FILL_CLASS;
    }
    if (dom.charCardName) {
        dom.charCardName.textContent = (conv.group && conv.group.name) ? conv.group.name : '群聊';
    }
    if (dom.charCardTagCount) {
        dom.charCardTagCount.textContent = buildGroupCharacterSummary(members);
    }
}

function renderCharacterPanelAvatar(character) {
    if (!dom.charCardAvatar) return;

    var src = character.previewImage || character.avatar;
    if (src) {
        dom.charCardAvatar.innerHTML = '<img src="' + src + '" class="w-full h-full object-cover rounded-lg" alt="' + (character.name || '') + '">';
        dom.charCardAvatar.className = CHARACTER_PANEL_IMAGE_AVATAR_CLASS;
    } else {
        dom.charCardAvatar.textContent = character.name ? character.name.charAt(0).toUpperCase() : '?';
        dom.charCardAvatar.className = CHARACTER_PANEL_AVATAR_FILL_CLASS;
    }
}

function renderSingleCharacterPanel(character) {
    setCharacterPanelCardVisible(true);
    setCharacterPanelActionButtonsVisible(true);
    renderCharacterPanelAvatar(character);

    if (dom.charCardName) dom.charCardName.textContent = character.name || t('char_empty_name');
    if (dom.charCardTagCount) {
        var tagCount = character.tags ? character.tags.length : 0;
        dom.charCardTagCount.textContent = tagCount + ' tag' + (tagCount !== 1 ? 's' : '');
    }
}
