// ==================== New Chat Picker Card UI ====================
function createNewChatPickerCharacterCard(character, options) {
    options = options || {};

    var key = getNewChatPickerCharacterKey(character);
    var isSelected = !!options.isSelected;
    var multiSelectMode = !!options.multiSelectMode;
    var card = document.createElement('div');
    card.className = 'glass rounded-2xl p-3 cursor-pointer flex flex-col items-center text-center gap-2 border transition-all relative group ' +
        (isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-white/5 hover:border-white/10 hover:bg-white/5');

    var letter = character.name ? character.name.charAt(0).toUpperCase() : '?';
    var pSrc = character.previewImage || character.avatar;
    var avatarHTML = pSrc
        ? '<div class="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0"><img src="' + escapeHtml(pSrc) + '" class="w-full h-full object-cover" alt="' + escapeHtml(character.name || '') + '" onerror="this.parentNode.outerHTML=\'<div class=\\\'w-12 h-12 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-xl font-bold flex-shrink-0\\\'>' + letter + '</div>\'"></div>'
        : '<div class="w-12 h-12 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-xl font-bold flex-shrink-0">' + letter + '</div>';

    card.innerHTML = [
        avatarHTML,
        '<div class="min-w-0 w-full">',
            '<p class="text-sm font-medium text-zinc-100 truncate">' + escapeHtml(character.name || t('char_empty_name')) + '</p>',
        '</div>',
        multiSelectMode
            ? '<div class="absolute top-1 right-1 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ' +
                (isSelected ? 'bg-amber-400 border-amber-300 text-black' : 'border-white/40 bg-black/30') +
                '">' + (isSelected ? '✓' : '') + '</div>'
            : '<button class="char-delete-btn absolute top-1 right-1 text-white/80 hover:text-red-400 active:text-red-500 text-xl font-bold leading-none p-1 z-10 opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto" title="删除角色卡">×</button>'
    ].join('');

    card.addEventListener('click', function(e) {
        if (!multiSelectMode) {
            if (e.target.closest('.char-delete-btn') || e.target.closest('button[title="删除角色卡"]')) return;
            if (typeof options.onOpen === 'function') options.onOpen(character);
            return;
        }
        if (typeof options.onToggle === 'function') options.onToggle(key);
    });

    var delBtn = card.querySelector('.char-delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var displayName = character.name || '该角色卡';
            var confirmed = await showGlassConfirm(
                '确定从角色库中删除「' + displayName + '」？\n已有对话中的角色卡数据不会受影响。',
                { title: '删除角色卡', danger: true, okText: '删除' }
            );
            if (!confirmed) return;
            deleteCharacterFromLibrary(key);
        });
    }

    return card;
}
