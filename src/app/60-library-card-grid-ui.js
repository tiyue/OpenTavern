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

function triggerCardImageUpload(char) {
    if (!char || !char.name) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function() {
        const file = input.files && input.files[0];
        if (!file) {
            document.body.removeChild(input);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(ev) {
            const dataUrl = ev.target.result;
            const key = (char.name || '').trim().toLowerCase();
            if (state.characters && state.characters[key]) {
                state.characters[key].previewImage = dataUrl;
                persistState(true);
                if (typeof renderMyCards === 'function') renderMyCards();
                // Refresh active chat avatars if this card is loaded
                try {
                    if (currentCharacterName && currentCharacterName.trim().toLowerCase() === key) {
                        const chAvatar = document.getElementById('charAvatar');
                        if (chAvatar) {
                            chAvatar.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-xl" alt="${(char.name || '').replace(/"/g,'&quot;')}">`;
                            chAvatar.className = 'w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
                        }
                        const cardAvatar = document.getElementById('charCardAvatar');
                        if (cardAvatar) {
                            cardAvatar.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-lg" alt="${(char.name || '').replace(/"/g,'&quot;')}">`;
                            cardAvatar.className = 'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
                        }
                    }
                } catch (e) {}
            }
            document.body.removeChild(input);
        };
        reader.onerror = function() {
            try { document.body.removeChild(input); } catch (_) {}
        };
        reader.readAsDataURL(file);
    };
    input.click();
}
