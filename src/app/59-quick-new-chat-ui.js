// ==================== Quick New Chat Action Modal (resolves library vs chat button conflict) ====================
function getCurrentChatCharacter() {
    const conv = getActiveConv();
    if (conv) {
        if (conv.character) return conv.character;
        if (conv.group && Array.isArray(conv.group.members) && conv.group.members.length > 0) {
            // For group chats, use the first member as representative "current character"
            return conv.group.members[0] && conv.group.members[0].character ? conv.group.members[0].character : null;
        }
    }
    if (currentCharacterName && state && state.characters) {
        const key = currentCharacterName.trim().toLowerCase();
        const found = Object.values(state.characters).find(c => (c.name || '').trim().toLowerCase() === key);
        if (found) return found;
    }
    return null;
}

function showQuickNewChatModal() {
    const modal = document.getElementById('quickNewChatModal');
    if (!modal) {
        // Fallback: directly open full picker
        showNewChatCharacterPicker();
        return;
    }

    const closeBtn = document.getElementById('quickNewChatCloseBtn');
    const backdrop = document.getElementById('quickNewChatBackdrop');
    const withCurrentBtn = document.getElementById('quickNewChatWithCurrentBtn');
    const returnBtn = document.getElementById('quickReturnToLibraryBtn');
    const groupBtn = document.getElementById('quickNewGroupChatBtn');

    // Optionally enhance first button with current name (i18n aware)
    const currentChar = getCurrentChatCharacter();
    if (withCurrentBtn) {
        const base = t('quick_new_with_current') || '与当前角色开启新对话';
        if (currentChar && currentChar.name) {
            withCurrentBtn.innerHTML = `${base}（${escapeHtml(currentChar.name)}）`;
        } else {
            withCurrentBtn.innerHTML = base;
        }
    }

    function hide() {
        modal.classList.add('hidden');
    }

    // Wire once
    if (!modal._wiredQuick) {
        modal._wiredQuick = true;

        if (closeBtn) closeBtn.addEventListener('click', hide);
        if (backdrop) backdrop.addEventListener('click', hide);

        if (withCurrentBtn) {
            withCurrentBtn.addEventListener('click', () => {
                hide();
                const ch = getCurrentChatCharacter();
                if (ch) {
                    newConversation(ch);
                } else {
                    // Current chat has no character (blank chat) → start a fresh blank conversation
                    newConversation(null);
                }
            });
        }

        if (returnBtn) {
            returnBtn.addEventListener('click', () => {
                hide();
                currentCharacterName = null;
                if (typeof renderConversationList === 'function') renderConversationList();
                if (typeof switchView === 'function') switchView('library');
            });
        }

        if (groupBtn) {
            groupBtn.addEventListener('click', () => {
                hide();
                // Tell the picker that it was opened from the quick 3-button menu,
                // so it can offer a "返回" button to come back here.
                newChatPickerCameFromQuick = true;
                showNewChatCharacterPicker();
            });
        }
    }

    modal.classList.remove('hidden');
}
