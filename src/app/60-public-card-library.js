// ==================== Public Card Library helpers ====================
function getPublicCards() {
    return Array.isArray(PUBLIC_CARDS) ? PUBLIC_CARDS : [];
}

function findPublicCardById(id) {
    if (!id) return null;
    return getPublicCards().find(card => card && card.id === id) || null;
}
