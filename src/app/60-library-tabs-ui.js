// ==================== Library Tabs UI ====================
var LIBRARY_TAB_ACTIVE_CLASSES = ['active', 'border-b-2', 'border-amber-500', 'text-amber-400'];

function setActiveTab(tab) {
    activeLibraryTab = tab;
    var elements = getLibraryTabElements();
    var showMy = tab === 'my';

    setLibraryTabGridVisibility(elements, showMy);
    setLibraryTabButtonActive(elements.tabMy, showMy);
    setLibraryTabButtonActive(elements.tabPub, !showMy);
}

function getLibraryTabElements() {
    return {
        myGrid: document.getElementById('myCardsGrid'),
        pubGrid: document.getElementById('publicCardsGrid'),
        tabMy: document.getElementById('tabMy'),
        tabPub: document.getElementById('tabPublic')
    };
}

function setLibraryTabGridVisibility(elements, showMy) {
    if (elements.myGrid) elements.myGrid.classList.toggle('hidden', !showMy);
    if (elements.pubGrid) elements.pubGrid.classList.toggle('hidden', showMy);
}

function setLibraryTabButtonActive(button, active) {
    if (!button) return;
    LIBRARY_TAB_ACTIVE_CLASSES.forEach(function(cls) {
        button.classList.toggle(cls, !!active);
    });
}

function wireLibraryTabButtons() {
    var elements = getLibraryTabElements();
    wireLibraryTabButton(elements.tabMy, 'my');
    wireLibraryTabButton(elements.tabPub, 'public');
}

function wireLibraryTabButton(button, tab) {
    if (!button || button._wired) return;
    button._wired = true;
    button.addEventListener('click', function() {
        setActiveTab(tab);
    });
}

function syncLibraryFilterButtons() {
    document.querySelectorAll('#libraryView [data-filter]').forEach(function(button) {
        syncLibraryFilterButton(button);
    });
}

function syncLibraryFilterButton(button) {
    var active = button.dataset.filter === libraryFilter;
    button.classList.toggle('bg-amber-500/20', active);
    button.classList.toggle('text-amber-300', active);
}

function syncLibrarySearchInput() {
    var libSearchSync = document.getElementById('librarySearch');
    if (libSearchSync) libSearchSync.value = librarySearchQuery || '';
}
