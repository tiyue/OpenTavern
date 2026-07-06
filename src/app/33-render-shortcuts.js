// ==================== Render Shortcut Helpers ====================
function requestFullRender() {
    renderAll();
}

function requestRender(key) {
    if (Array.isArray(key)) {
        appStore.notify(key);
    } else {
        appStore.notify([key]);
    }
}

function renderMessagesOnly() {
    if (dom.messagesContainer) renderMessages();
}

function renderConversationListOnly() {
    if (dom.convList) renderConversationList();
}

function renderCharacterUI() {
    renderCharacterCard();
    renderTopBar();
}
