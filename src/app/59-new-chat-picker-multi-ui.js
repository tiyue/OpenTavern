// ==================== New Chat Picker Multi-select UI ====================
function createNewChatPickerSession(modal, listContainer, characters) {
    return {
        modal,
        listContainer,
        characters,
        multiSelectMode: false,
        selectedKeys: new Set()
    };
}

function renderNewChatPickerSessionCards(session) {
    session.listContainer.innerHTML = '';

    session.characters.forEach(character => {
        const key = getNewChatPickerCharacterKey(character);
        const card = createNewChatPickerCharacterCard(character, {
            isSelected: session.selectedKeys.has(key),
            multiSelectMode: session.multiSelectMode,
            onOpen: function(ch) {
                newChatPickerCameFromQuick = false;
                session.modal.classList.add('hidden');
                newConversation(ch);
            },
            onToggle: function(selectedKey) {
                toggleNewChatPickerCharacterSelection(session, selectedKey);
            }
        });

        session.listContainer.appendChild(card);
    });
}

function toggleNewChatPickerCharacterSelection(session, selectedKey) {
    if (session.selectedKeys.has(selectedKey)) {
        session.selectedKeys.delete(selectedKey);
    } else {
        session.selectedKeys.add(selectedKey);
    }
    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
}

function refreshNewChatPickerSessionMultiBar(session) {
    updateNewChatPickerMultiBar(session.multiSelectMode, session.selectedKeys.size);
}

function ensureNewChatPickerMultiControls(modal) {
    if (modal._multiControlsAdded) return;

    const bottomArea = modal.querySelector('.mt-4.pt-4.border-t');
    if (!bottomArea) return;
    modal._multiControlsAdded = true;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'w-full mb-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-all';
    updateNewChatPickerMultiToggleText(toggleBtn, false);
    toggleBtn.addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (!session) return;
        setNewChatPickerMultiMode(session, !session.multiSelectMode);
    });

    bottomArea.parentNode.insertBefore(toggleBtn, bottomArea);
    modal._multiToggleBtn = toggleBtn;
    modal._multiBottomArea = bottomArea;
}

function resetNewChatPickerMultiControls(session) {
    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, false);
    }
    syncNewChatPickerGroupConfirmBar(session);
}

function setNewChatPickerMultiMode(session, enabled) {
    session.multiSelectMode = !!enabled;
    session.selectedKeys.clear();

    if (session.modal._multiToggleBtn) {
        updateNewChatPickerMultiToggleText(session.modal._multiToggleBtn, session.multiSelectMode);
    }

    renderNewChatPickerSessionCards(session);
    refreshNewChatPickerSessionMultiBar(session);
    syncNewChatPickerGroupConfirmBar(session);
}

function updateNewChatPickerMultiToggleText(toggleBtn, enabled) {
    const multiSelectText = t('new_chat_multi_select') || '多选创建群组聊天';
    const multiExitText = t('new_chat_multi_exit') || '退出多选模式';
    toggleBtn.textContent = enabled ? multiExitText : multiSelectText;
}

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

function getNewChatPickerSelectedCharacters(session) {
    return Array.from(session.selectedKeys)
        .map(k => session.characters.find(c => getNewChatPickerCharacterKey(c) === k))
        .filter(Boolean);
}
