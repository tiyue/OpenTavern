// ==================== My Library Card Items ====================
function createMyLibraryCharacterCard(char) {
    const cardEl = document.createElement('div');
    cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col group';

    cardEl.appendChild(createMyCharacterPreview(char));
    cardEl.appendChild(createMyCharacterInfo(char));
    cardEl.addEventListener('click', (e) => {
        if (isMyCharacterCardControlClick(e)) return;
        loadOrCreateChatForCharacter(char);
    });

    return cardEl;
}
