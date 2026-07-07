// ==================== Public Library Card Detail Content Helpers ====================
function renderPublicCardDetailTags(tagsDiv, tags) {
    tagsDiv.innerHTML = '';
    (tags || []).forEach(function(tag) {
        const pill = document.createElement('span');
        pill.className = 'px-2 py-0.5 bg-white/10 rounded text-xs';
        pill.textContent = tag;
        tagsDiv.appendChild(pill);
    });
}

function getImportedPublicCardCharacter(card) {
    return state.characters[(card.name || '').toLowerCase().trim()];
}

function renderPublicCardDetailModalContent(elements, card) {
    elements.name.textContent = card.name || '';
    elements.author.textContent = formatPublicCardDetailAuthor(card.author);
    renderPublicCardDetailTags(elements.tags, card.tags);
    elements.desc.textContent = card.description || '';
}
