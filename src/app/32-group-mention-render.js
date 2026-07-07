// ==================== Group Mention Render Helpers ====================
function getGroupMentionDisplayName(char) {
    let display = (char && char.name) || '角色';
    if (display.includes('（')) {
        display = display.split('（')[0];
    }
    if (display.length > 5) {
        display = display.slice(0, 4) + '…';
    }
    return display;
}

function buildGroupMentionAvatarHtml(char) {
    char = char || {};
    const letter = char.name ? char.name.charAt(0).toUpperCase() : '?';
    const pSrc = char.previewImage || char.avatar;
    if (pSrc) {
        return `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0"><img src="${escapeHtml(pSrc)}" class="w-full h-full object-cover" alt="${escapeHtml(char.name || '')}" onerror="this.parentNode.outerHTML='<div class=\\'w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0\\'>${letter}</div>'"></div>`;
    }
    return `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0">${letter}</div>`;
}

function buildGroupMentionMemberHtml(char, isMuted) {
    char = char || {};
    const avatarHTML = buildGroupMentionAvatarHtml(char);
    return `
        ${avatarHTML}
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
                <span class="font-medium text-zinc-100 text-sm sm:text-base truncate">${escapeHtml(char.name || '未命名')}</span>
                ${isMuted ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">已静音</span>' : ''}
            </div>
            ${char.personality ? `<p class="text-[11px] sm:text-xs text-zinc-400 line-clamp-1 mt-0.5">${escapeHtml(char.personality.slice(0, 60))}</p>` : ''}
        </div>
    `;
}

function createGroupMentionMemberElement(member, onSelect) {
    const char = member.character || {};
    const isMuted = !!member.muted;
    const item = document.createElement('div');
    item.className = `flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer active:bg-white/10 transition-colors ${isMuted ? 'opacity-60' : 'hover:bg-white/5'}`;
    item.innerHTML = buildGroupMentionMemberHtml(char, isMuted);

    if (!isMuted) {
        item.addEventListener('click', () => onSelect(char));
    }

    return item;
}

