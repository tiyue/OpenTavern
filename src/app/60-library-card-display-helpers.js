function getLibraryCardDisplayName(card) {
    return (card && card.name) || 'Unnamed';
}

function getLibraryCardInitial(card) {
    return ((card && card.name) || '?').charAt(0).toUpperCase();
}

function formatLibraryCardTags(tags) {
    return (tags || []).slice(0, 3).join(' · ');
}

function createLibraryCardInfo(card) {
    const info = document.createElement('div');
    info.className = 'p-2';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium text-zinc-100 truncate';
    name.textContent = getLibraryCardDisplayName(card);

    const tags = document.createElement('div');
    tags.className = 'text-[10px] text-zinc-400 mt-0.5 truncate';
    tags.textContent = formatLibraryCardTags(card && card.tags);

    info.appendChild(name);
    info.appendChild(tags);
    return info;
}
