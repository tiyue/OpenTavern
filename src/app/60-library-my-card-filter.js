function buildMyLibraryCharacterFilterCard(character) {
    return {
        name: character.name,
        tags: character.tags,
        description: character.description || character.personality,
        author: character.author || character.creator || character.creator_notes || ''
    };
}

function getFilteredMyLibraryCharacters() {
    return Object.values(state.characters || {}).filter(function(character) {
        return passesLibraryFilter(buildMyLibraryCharacterFilterCard(character));
    });
}
