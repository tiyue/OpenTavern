function renderPublicCards() {
    const grid = document.getElementById('publicCardsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    getFilteredPublicLibraryCards().forEach(card => {
        grid.appendChild(createPublicLibraryCard(card));
    });
}

function renderLibraryGrids() {
    renderMyCards();
    renderPublicCards();
}
