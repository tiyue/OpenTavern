function buildMyLibraryCharacterFilterCard(character) {
    return {
        name: character.name,
        tags: character.tags,
        description: character.description || character.personality,
        author: character.author || character.creator || character.creator_notes || ''
    };
}

function getFilteredMyLibraryCharacters() {
    var characters = typeof getOrderedMyLibraryCharacters === 'function'
        ? getOrderedMyLibraryCharacters()
        : Object.values(state.characters || {});
    return characters.filter(function(character) {
        return passesLibraryFilter(buildMyLibraryCharacterFilterCard(character));
    });
}
