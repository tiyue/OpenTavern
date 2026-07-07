function getCardOrientation(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    const hasFemale = /女|female|futa|娘|女仆|姬/.test(t);
    const hasMale = /男|male|攻|男主|男友/.test(t);
    if (hasFemale && !hasMale) return 'male';
    if (hasMale && !hasFemale) return 'female';
    return 'both';
}

function passesLibraryFilter(card) {
    const q = (librarySearchQuery || '').toLowerCase().trim();
    if (q) {
        const nameMatch = (card.name || '').toLowerCase().includes(q);
        const tagsMatch = (card.tags || []).some(t => (t || '').toLowerCase().includes(q));
        const descMatch = (card.description || card.personality || '').toLowerCase().includes(q);
        const authorMatch = (card.author || '').toLowerCase().includes(q);
        if (!(nameMatch || tagsMatch || descMatch || authorMatch)) return false;
    }
    if (libraryFilter !== 'all') {
        const o = getCardOrientation(card.tags || []);
        if (libraryFilter === 'male' && o !== 'male' && o !== 'both') return false;
        if (libraryFilter === 'female' && o !== 'female' && o !== 'both') return false;
    }
    return true;
}
