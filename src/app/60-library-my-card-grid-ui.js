function renderMyCards() {
    const grid = document.getElementById('myCardsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    appendMyCardActionTiles(grid);

    getFilteredMyLibraryCharacters().forEach(char => {
        grid.appendChild(createMyLibraryCharacterCard(char));
    });
}

function getFilteredMyLibraryCharacters() {
    return Object.values(state.characters || {}).filter(c => passesLibraryFilter({
        name: c.name,
        tags: c.tags,
        description: c.description || c.personality,
        author: c.author || c.creator || c.creator_notes || ''
    }));
}
