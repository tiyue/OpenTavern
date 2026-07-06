// ==================== Library Tabs UI ====================
var LIBRARY_TAB_ACTIVE_CLASSES = ['active', 'border-b-2', 'border-amber-500', 'text-amber-400'];

function setActiveTab(tab) {
    activeLibraryTab = tab;
    var myGrid = document.getElementById('myCardsGrid');
    var pubGrid = document.getElementById('publicCardsGrid');
    var tabMy = document.getElementById('tabMy');
    var tabPub = document.getElementById('tabPublic');
    var showMy = tab === 'my';

    if (myGrid) myGrid.classList.toggle('hidden', !showMy);
    if (pubGrid) pubGrid.classList.toggle('hidden', showMy);
    setLibraryTabButtonActive(tabMy, showMy);
    setLibraryTabButtonActive(tabPub, !showMy);
}

function setLibraryTabButtonActive(button, active) {
    if (!button) return;
    LIBRARY_TAB_ACTIVE_CLASSES.forEach(function(cls) {
        button.classList.toggle(cls, !!active);
    });
}

function wireLibraryTabButtons() {
    var tabMy = document.getElementById('tabMy');
    var tabPub = document.getElementById('tabPublic');
    if (tabMy && !tabMy._wired) {
        tabMy._wired = true;
        tabMy.addEventListener('click', function() {
            setActiveTab('my');
        });
    }
    if (tabPub && !tabPub._wired) {
        tabPub._wired = true;
        tabPub.addEventListener('click', function() {
            setActiveTab('public');
        });
    }
}

function syncLibraryFilterButtons() {
    document.querySelectorAll('#libraryView [data-filter]').forEach(function(button) {
        var active = button.dataset.filter === libraryFilter;
        button.classList.toggle('bg-amber-500/20', active);
        button.classList.toggle('text-amber-300', active);
    });
}

function syncLibrarySearchInput() {
    var libSearchSync = document.getElementById('librarySearch');
    if (libSearchSync) libSearchSync.value = librarySearchQuery || '';
}
