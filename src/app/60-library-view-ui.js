// ==================== Library View / Tab Rendering ====================
function switchView(view) {
    currentView = view;
    var libraryV = document.getElementById('libraryView');
    var chatV = document.getElementById('chatView');
    if (!libraryV || !chatV) return;

    if (view === 'library') {
        showLibraryView(libraryV, chatV);
    } else {
        showChatView(libraryV, chatV);
    }

    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}

function showLibraryView(libraryV, chatV) {
    libraryV.classList.remove('hidden');
    chatV.classList.add('hidden');

    if (typeof renderLibrary === 'function') {
        renderLibrary();
    } else {
        if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        if (typeof setActiveTab === 'function') setActiveTab(activeLibraryTab || 'my');
    }

    if (typeof renderConversationList === 'function') renderConversationList();
    showLibraryConversationList();
    setLibrarySidebarMode(true);
}

function showChatView(libraryV, chatV) {
    libraryV.classList.add('hidden');
    chatV.classList.remove('hidden');
    showLibraryConversationList();
    setLibrarySidebarMode(false);

    if (typeof renderConversationList === 'function') renderConversationList();
}

function renderLibrary() {
    var lib = document.getElementById('libraryView');
    var chat = document.getElementById('chatView');
    if (lib) lib.classList.remove('hidden');
    if (chat) chat.classList.add('hidden');

    renderLibraryGrids();
    wireLibraryTabButtons();
    setActiveTab(activeLibraryTab);
    syncLibraryFilterButtons();
    syncLibrarySearchInput();
    setLibrarySidebarMode(true);
}
