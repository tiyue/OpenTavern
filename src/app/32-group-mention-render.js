/**
 * 新手导读（文件：32-group-mention-render.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、点名、渲染”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `getGroupMentionDisplayName(char)`、`buildGroupMentionAvatarHtml(char)`、`buildGroupMentionMemberHtml(char, isMuted)`、`createGroupMentionMemberElement(member, onSelect)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
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

