// ==================== My Library Card Info UI ====================
function createMyCharacterInfo(char) {
    const info = document.createElement('div');
    info.className = 'p-2';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium text-zinc-100 truncate';
    name.textContent = char.name || 'Unnamed';

    const tags = document.createElement('div');
    tags.className = 'text-[10px] text-zinc-400 mt-0.5 truncate';
    tags.textContent = (char.tags || []).slice(0, 3).join(' · ');

    info.appendChild(name);
    info.appendChild(tags);
    return info;
}
