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
    const elements = getPublicCardDetailModalElements();
    renderPublicCardDetailModalContent(elements, card);
    bindPublicCardDetailModalActions(detailModal, card, elements);
}

function bindPublicCardDetailModalActions(detailModal, card, elements) {
    const close = () => hidePublicCardDetailModal(detailModal);
    elements.close.onclick = close;
    elements.backdrop.onclick = close;
    elements.importButton.onclick = async () => {
        await importPublicCardDetailAndOpenChat(detailModal, card);
    };
}
