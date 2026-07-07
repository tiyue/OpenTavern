function getFilteredPublicLibraryCards() {
    return getPublicCards().filter(function(card) {
        return passesLibraryFilter(card);
    });
}
