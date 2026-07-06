// ==================== Library Event Bindings ====================
function bindLibraryEvents() {
    var tabMyEl = document.getElementById('tabMy');
    var tabPubEl = document.getElementById('tabPublic');

    if (tabMyEl) {
        tabMyEl.onclick = function() {
            if (typeof setActiveTab === 'function') setActiveTab('my');
        };
    }
    if (tabPubEl) {
        tabPubEl.onclick = function() {
            if (typeof setActiveTab === 'function') setActiveTab('public');
        };
    }

    var libSearch = document.getElementById('librarySearch');
    if (libSearch) {
        libSearch.oninput = function() {
            librarySearchQuery = libSearch.value;
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        };
    }

    document.querySelectorAll('#libraryView [data-filter]').forEach(function(btn) {
        btn.onclick = function() {
            libraryFilter = btn.dataset.filter;
            document.querySelectorAll('#libraryView [data-filter]').forEach(function(item) {
                item.classList.remove('bg-amber-500/20', 'text-amber-300');
            });
            btn.classList.add('bg-amber-500/20', 'text-amber-300');
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        };
    });
}
