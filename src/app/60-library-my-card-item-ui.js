// ==================== My Library Card Items ====================
function createMyLibraryCharacterCard(char) {
    const cardEl = document.createElement('div');
    cardEl.className = 'my-library-character-card glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col group select-none';
    cardEl.setAttribute('data-card-key', getMyCharacterCardKey(char));

    cardEl.appendChild(createMyCharacterPreview(char));
    cardEl.appendChild(createMyCharacterInfo(char));
    cardEl.addEventListener('click', (e) => {
        if (typeof shouldSuppressMyCardReorderClick === 'function' && shouldSuppressMyCardReorderClick()) return;
        if (isMyCharacterCardControlClick(e)) return;
        loadOrCreateChatForCharacter(char);
    });
    if (typeof bindMyCardReorderEvents === 'function') {
        bindMyCardReorderEvents(cardEl);
    }

    return cardEl;
}
