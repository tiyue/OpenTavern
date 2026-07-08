function renderMyCards() {
    const grid = document.getElementById('myCardsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    getFilteredMyLibraryCharacters().forEach(char => {
        grid.appendChild(createMyLibraryCharacterCard(char));
    });
    appendMyCardActionTiles(grid);
}
