// ==================== Public Card Asset Helpers ====================
function normalizePublicCardAssetPath(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return url.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

function resolvePublicCardAssetUrl(url) {
    url = normalizePublicCardAssetPath(url);
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (window.location && window.location.protocol === 'file:' && url.charAt(0) === '/') {
        return url.replace(/^\/+/, '');
    }
    return url;
}

function resolvePublicCardImageUrl(card) {
    return resolvePublicCardAssetUrl(card && card.previewImage);
}

function resolvePublicCardJsonUrl(card) {
    return resolvePublicCardAssetUrl(card && card.jsonUrl);
}
