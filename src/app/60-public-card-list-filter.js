// ==================== Public Card List Filtering ====================
function normalizeCardLibraryQuery(query) {
    return (query || '').toLowerCase().trim();
}

function cardMatchesLibraryQuery(card, query) {
    if (!query) return true;
    const nameMatch = (card.name || '').toLowerCase().includes(query);
    const authorMatch = (card.author || '').toLowerCase().includes(query);
    const descMatch = (card.description || '').toLowerCase().includes(query);
    const tagsMatch = (card.tags || []).some(t => (t || '').toLowerCase().includes(query));
    return nameMatch || authorMatch || descMatch || tagsMatch;
}

function getFilteredCardLibraryCards(query) {
    return filterCardLibraryCards(getPublicCards(), query);
}

function filterCardLibraryCards(cards, query) {
    const q = normalizeCardLibraryQuery(query);
    return (cards || []).filter(card => cardMatchesLibraryQuery(card, q));
}
