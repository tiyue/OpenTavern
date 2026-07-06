// ==================== Library Sidebar Mode UI ====================
function showLibraryConversationList() {
    var convListEl = document.getElementById('convList');
    if (convListEl) convListEl.style.display = '';
}

function getSidebarSectionByI18n(key) {
    var title = document.querySelector('#sidebar span[data-i18n="' + key + '"]');
    return title ? title.closest('.glass') : null;
}

function setSidebarSectionVisible(key, visible) {
    var block = getSidebarSectionByI18n(key);
    if (block) block.style.display = visible ? '' : 'none';
}

function setLibrarySidebarMode(enabled) {
    setSidebarSectionVisible('char_card_title', !enabled);
    setSidebarSectionVisible('world_book', !enabled);

    if (enabled) {
        var fallbackWorldBlock = document.querySelector('#sidebar .glass.rounded-xl.px-3.py-2');
        if (fallbackWorldBlock) fallbackWorldBlock.style.display = 'none';
    }

    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('library-mode', !!enabled);
}
