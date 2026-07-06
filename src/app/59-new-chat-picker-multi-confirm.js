// ==================== New Chat Picker Multi-select Confirm Bar ====================
function syncNewChatPickerGroupConfirmBar(session) {
    const modal = session.modal;
    const bottomArea = modal._multiBottomArea;
    if (!bottomArea) return;

    let confirmBar = modal.querySelector('#newChatGroupConfirmBar');
    if (session.multiSelectMode) {
        if (!confirmBar) {
            confirmBar = createNewChatPickerGroupConfirmBar(modal);
            bottomArea.parentNode.insertBefore(confirmBar, bottomArea);
        }
        confirmBar.style.display = 'flex';
    } else if (confirmBar) {
        confirmBar.style.display = 'none';
    }
}

function createNewChatPickerGroupConfirmBar(modal) {
    const confirmBar = document.createElement('div');
    confirmBar.id = 'newChatGroupConfirmBar';
    confirmBar.className = 'mt-3 flex gap-2';
    const createGroupText = t('new_chat_create_group') || '创建群组聊天';
    const cancelMultiText = t('new_chat_cancel_multi') || '取消';
    confirmBar.innerHTML = `
        <button id="newChatCreateGroupBtn"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all">
            ${createGroupText}
        </button>
        <button id="newChatCancelMultiBtn"
                class="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 transition-all">
            ${cancelMultiText}
        </button>
    `;

    confirmBar.querySelector('#newChatCreateGroupBtn').addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (!session) return;

        const selectedChars = getNewChatPickerSelectedCharacters(session);
        if (selectedChars.length >= 2) {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
            newConversation(selectedChars);
        } else {
            alert('请至少选择 2 个角色创建群组');
        }
    });

    confirmBar.querySelector('#newChatCancelMultiBtn').addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (session) setNewChatPickerMultiMode(session, false);
    });

    return confirmBar;
}
