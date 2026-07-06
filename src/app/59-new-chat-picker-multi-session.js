// ==================== New Chat Picker Multi-select Session ====================
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

function getNewChatPickerSelectedCharacters(session) {
    return Array.from(session.selectedKeys)
        .map(k => session.characters.find(c => getNewChatPickerCharacterKey(c) === k))
        .filter(Boolean);
}
