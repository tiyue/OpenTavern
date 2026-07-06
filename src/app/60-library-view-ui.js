// ==================== Library View / Tab Rendering ====================
function switchView(view) {
    currentView = view;
    const libraryV = document.getElementById('libraryView');
    const chatV = document.getElementById('chatView');
    if (!libraryV || !chatV) return;

    const convListEl = document.getElementById('convList');

    if (view === 'library') {
        libraryV.classList.remove('hidden');
        chatV.classList.add('hidden');
        if (typeof renderLibrary === 'function') {
            renderLibrary();
        } else {
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
            if (typeof setActiveTab === 'function') setActiveTab(activeLibraryTab || 'my');
        }
        if (typeof renderConversationList === 'function') renderConversationList();
        if (convListEl) convListEl.style.display = '';
        const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
        if (charTitle) {
            const charBlock = charTitle.closest('.glass');
            if (charBlock) charBlock.style.display = 'none';
        }
        const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
        if (worldTitle) {
            const worldBlock = worldTitle.closest('.glass');
            if (worldBlock) worldBlock.style.display = 'none';
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('library-mode');
    } else {
        libraryV.classList.add('hidden');
        chatV.classList.remove('hidden');

        if (convListEl) convListEl.style.display = '';
        const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
        if (charTitle) {
            const charBlock = charTitle.closest('.glass');
            if (charBlock) charBlock.style.display = '';
        }
        const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
        if (worldTitle) {
            const worldBlock = worldTitle.closest('.glass');
            if (worldBlock) worldBlock.style.display = '';
        }
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('library-mode');

        if (typeof renderConversationList === 'function') renderConversationList();
    }

    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}

function setActiveTab(tab) {
    activeLibraryTab = tab;
    const myGrid = document.getElementById('myCardsGrid');
    const pubGrid = document.getElementById('publicCardsGrid');
    const tabMy = document.getElementById('tabMy');
    const tabPub = document.getElementById('tabPublic');

    if (tab === 'my') {
        if (myGrid) myGrid.classList.remove('hidden');
        if (pubGrid) pubGrid.classList.add('hidden');
        if (tabMy) tabMy.classList.add('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
        if (tabPub) tabPub.classList.remove('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
    } else {
        if (myGrid) myGrid.classList.add('hidden');
        if (pubGrid) pubGrid.classList.remove('hidden');
        if (tabMy) tabMy.classList.remove('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
        if (tabPub) tabPub.classList.add('active', 'border-b-2', 'border-amber-500', 'text-amber-400');
    }
}

function renderLibrary() {
    const lib = document.getElementById('libraryView');
    const chat = document.getElementById('chatView');
    if (lib) lib.classList.remove('hidden');
    if (chat) chat.classList.add('hidden');

    renderLibraryGrids();

    const tabMy = document.getElementById('tabMy');
    const tabPub = document.getElementById('tabPublic');
    if (tabMy && !tabMy._wired) {
        tabMy._wired = true;
        tabMy.addEventListener('click', () => {
            setActiveTab('my');
        });
    }
    if (tabPub && !tabPub._wired) {
        tabPub._wired = true;
        tabPub.addEventListener('click', () => {
            setActiveTab('public');
        });
    }

    setActiveTab(activeLibraryTab);

    document.querySelectorAll('#libraryView [data-filter]').forEach(b => {
        b.classList.remove('bg-amber-500/20', 'text-amber-300');
        if (b.dataset.filter === libraryFilter) {
            b.classList.add('bg-amber-500/20', 'text-amber-300');
        }
    });

    const libSearchSync = document.getElementById('librarySearch');
    if (libSearchSync) libSearchSync.value = librarySearchQuery || '';

    const charTitle = document.querySelector('#sidebar span[data-i18n="char_card_title"]');
    if (charTitle) {
        const charBlock = charTitle.closest('.glass');
        if (charBlock) charBlock.style.display = 'none';
    }
    const worldTitle = document.querySelector('#sidebar span[data-i18n="world_book"]');
    if (worldTitle) {
        const worldBlock = worldTitle.closest('.glass');
        if (worldBlock) worldBlock.style.display = 'none';
    }
    const worldBlock2 = document.querySelector('#sidebar .glass.rounded-xl.px-3.py-2');
    if (worldBlock2) worldBlock2.style.display = 'none';
}
