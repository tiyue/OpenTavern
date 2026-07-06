// ==================== Public Card Library helpers ====================
function getPublicCards() {
    return Array.isArray(PUBLIC_CARDS) ? PUBLIC_CARDS : [];
}

function resolvePublicCardAssetUrl(url) {
    url = String(url || '');
    if (!url) return '';
    if (window.location && window.location.protocol === 'file:' && url.charAt(0) === '/') {
        return url.replace(/^\/+/, '');
    }
    return url;
}

function findPublicCardById(id) {
    if (!id) return null;
    return getPublicCards().find(card => card && card.id === id) || null;
}
