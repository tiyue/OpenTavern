// ==================== Public Library Card Detail Modal ====================
function showPublicCardDetail(card) {
    const detailModal = ensurePublicCardDetailModal();
    fillPublicCardDetailModal(detailModal, card);
    detailModal.classList.remove('hidden');
}

function ensurePublicCardDetailModal() {
    let detailModal = document.getElementById('publicCardDetailModal');
    if (detailModal) return detailModal;

    detailModal = document.createElement('div');
    detailModal.id = 'publicCardDetailModal';
    detailModal.className = 'modal-overlay fixed inset-0 z-[150] flex items-center justify-center hidden';
    detailModal.innerHTML = buildPublicCardDetailModalHtml();
    document.body.appendChild(detailModal);
    return detailModal;
}

function fillPublicCardDetailModal(detailModal, card) {
    document.getElementById('publicDetailName').textContent = card.name || '';
    document.getElementById('publicDetailAuthor').textContent = formatPublicCardDetailAuthor(card.author);

    const tagsDiv = document.getElementById('publicDetailTags');
    renderPublicCardDetailTags(tagsDiv, card.tags);

    document.getElementById('publicDetailDesc').textContent = card.description || '';
    bindPublicCardDetailModalActions(detailModal, card);
}

function bindPublicCardDetailModalActions(detailModal, card) {
    const close = () => detailModal.classList.add('hidden');
    document.getElementById('publicDetailClose').onclick = close;
    document.getElementById('publicDetailBackdrop').onclick = close;
    document.getElementById('publicDetailImport').onclick = async () => {
        close();
        await importPublicCard(card);
        const importedChar = getImportedPublicCardCharacter(card);
        if (importedChar) {
            loadOrCreateChatForCharacter(importedChar);
        }
    };
}
