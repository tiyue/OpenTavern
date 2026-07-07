// ==================== My Library Card Preview UI ====================
function createMyCharacterPreview(char) {
    const preview = document.createElement('div');
    const pSrc = char.previewImage || char.avatar;
    const letter = getLibraryCardInitial(char);

    if (pSrc) {
        preview.className = 'aspect-[3/4] w-full overflow-hidden bg-zinc-900 rounded-t-2xl relative';
        const img = document.createElement('img');
        img.src = pSrc;
        img.className = 'w-full h-full object-cover';
        img.alt = char.name || '';
        img.onerror = () => setMyCharacterPreviewFallback(preview, letter);
        preview.appendChild(img);
    } else {
        setMyCharacterPreviewFallback(preview, letter);
    }

    preview.appendChild(createMyCharacterCardControls(char));
    return preview;
}

function setMyCharacterPreviewFallback(preview, letter) {
    const controls = preview.querySelector('.my-card-controls');
    preview.className = 'aspect-[3/4] w-full ot-avatar-fill flex items-center justify-center text-5xl font-bold text-white rounded-t-2xl relative';
    preview.textContent = letter;
    if (controls) preview.appendChild(controls);
}
