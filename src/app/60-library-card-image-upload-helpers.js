// ==================== Library Card Image Upload Helpers ====================
function createCardImageUploadInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
}

function removeCardImageUploadInput(input) {
    try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (_) {}
}

function getCardImageUploadFile(input) {
    return input && input.files && input.files[0] ? input.files[0] : null;
}

function readCardImageUploadFile(file, onLoad, onError) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        onLoad(ev.target.result);
    };
    reader.onerror = onError;
    reader.readAsDataURL(file);
}

function getCardImageUploadKey(char) {
    return (char && char.name ? char.name : '').trim().toLowerCase();
}

function escapeCardImageUploadAltText(text) {
    return String(text || '').replace(/"/g, '&quot;');
}

function buildCardImageUploadAvatarHtml(char, dataUrl, roundedClass) {
    return `<img src="${dataUrl}" class="w-full h-full object-cover ${roundedClass}" alt="${escapeCardImageUploadAltText(char && char.name)}">`;
}

function isActiveCharacterCardKey(key) {
    return !!(
        typeof currentCharacterName !== 'undefined' &&
        currentCharacterName &&
        getCardImageUploadKey({ name: currentCharacterName }) === key
    );
}

function refreshActiveCharacterImageAvatars(char, key, dataUrl) {
    try {
        if (!isActiveCharacterCardKey(key)) return;
        updateCardImageUploadAvatarElement(
            'charAvatar',
            char,
            dataUrl,
            'rounded-xl',
            'w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10'
        );
        updateCardImageUploadAvatarElement(
            'charCardAvatar',
            char,
            dataUrl,
            'rounded-lg',
            'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10'
        );
    } catch (e) {}
}

function updateCardImageUploadAvatarElement(id, char, dataUrl, roundedClass, wrapperClass) {
    const avatar = document.getElementById(id);
    if (!avatar) return;
    avatar.innerHTML = buildCardImageUploadAvatarHtml(char, dataUrl, roundedClass);
    avatar.className = wrapperClass;
}

function saveMyCharacterPreviewImage(char, dataUrl) {
    const key = getCardImageUploadKey(char);
    if (!(state.characters && state.characters[key])) return false;
    state.characters[key].previewImage = dataUrl;
    persistState(true);
    if (typeof renderMyCards === 'function') renderMyCards();
    refreshActiveCharacterImageAvatars(char, key, dataUrl);
    return true;
}
