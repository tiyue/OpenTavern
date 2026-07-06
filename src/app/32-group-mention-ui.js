// ==================== Group Mention UI Helpers ====================
function showGroupMentionPanel(conv) {
    const modal = dom.groupMentionModal;
    const listContainer = dom.groupMentionList;
    if (!modal || !listContainer || !conv) return;

    listContainer.innerHTML = '';

    const members = getGroupMembers(conv);
    if (members.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-zinc-400 text-center py-6">当前群组没有成员</p>';
        modal.classList.remove('hidden');
        return;
    }

    members.forEach(member => {
        const char = member.character;
        const isMuted = member.muted;

        const item = document.createElement('div');
        item.className = `flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer active:bg-white/10 transition-colors ${isMuted ? 'opacity-60' : 'hover:bg-white/5'}`;

        const letter = char.name ? char.name.charAt(0).toUpperCase() : '?';
        const pSrc = char.previewImage || char.avatar;
        const avatarHTML = pSrc
            ? `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0"><img src="${escapeHtml(pSrc)}" class="w-full h-full object-cover" alt="${escapeHtml(char.name || '')}" onerror="this.parentNode.outerHTML='<div class=\\'w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0\\'>${letter}</div>'"></div>`
            : `<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-base sm:text-lg font-bold flex-shrink-0">${letter}</div>`;

        item.innerHTML = `
            ${avatarHTML}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-zinc-100 text-sm sm:text-base truncate">${escapeHtml(char.name || '未命名')}</span>
                    ${isMuted ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">已静音</span>' : ''}
                </div>
                ${char.personality ? `<p class="text-[11px] sm:text-xs text-zinc-400 line-clamp-1 mt-0.5">${escapeHtml(char.personality.slice(0, 60))}</p>` : ''}
            </div>
        `;

        if (!isMuted) {
            item.addEventListener('click', () => {
                // 新逻辑：设置非编辑气泡，而不是往输入框插入纯文本 @名字
                setPendingGroupMention(char);
                modal.classList.add('hidden');

                // 聚焦输入框，让用户继续输入实际消息内容
                if (dom.messageInput) dom.messageInput.focus();
            });
        }

        listContainer.appendChild(item);
    });

    // 绑定关闭
    const close = () => modal.classList.add('hidden');
    dom.groupMentionCloseBtn.onclick = close;
    dom.groupMentionBackdrop.onclick = close;

    modal.classList.remove('hidden');
}

// ===== 新 @ 指定 UI 辅助：气泡而非文本插入（只能指定一个角色） =====
function setPendingGroupMention(char) {
    if (!char) return;
    pendingGroupMention = char;

    if (dom.mentionPill && dom.mentionPillName) {
        dom.mentionPill.classList.remove('hidden');
        dom.mentionPill.classList.add('flex');

        // 为手机端做紧凑显示：去掉英文括号部分 + 长度限制
        let display = char.name || '角色';
        if (display.includes('（')) {
            display = display.split('（')[0];
        }
        if (display.length > 5) {
            display = display.slice(0, 4) + '…';
        }
        dom.mentionPillName.textContent = '@' + display;

        // 工具提示显示完整名（hover / 长按可用）
        dom.mentionPill.title = char.name || '';
    }

    // 清理输入框里可能已有的旧 @ 文字（保持输入栏干净）
    if (dom.messageInput) {
        dom.messageInput.value = (dom.messageInput.value || '').replace(/@[^\s@，,。.!?]+/g, '').trim();
    }
}

function clearPendingGroupMention() {
    pendingGroupMention = null;
    if (dom.mentionPill) {
        dom.mentionPill.classList.remove('flex');
        dom.mentionPill.classList.add('hidden');
        if (dom.mentionPillName) {
            dom.mentionPillName.textContent = '';
            dom.mentionPill.title = '';
        }
    }
}
