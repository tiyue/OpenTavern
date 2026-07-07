function renderMyCards() {
    const grid = document.getElementById('myCardsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    appendMyCardActionTiles(grid);

    getFilteredMyLibraryCharacters().forEach(char => {
        grid.appendChild(createMyLibraryCharacterCard(char));
    });
}
