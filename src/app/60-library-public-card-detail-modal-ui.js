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
    detailModal.innerHTML = `
        <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" id="publicDetailBackdrop"></div>
        <div class="relative glass rounded-3xl w-[92%] max-w-md p-6 shadow-2xl animate-fade-in">
            <div class="flex justify-between items-center mb-4">
                <h3 id="publicDetailName" class="text-xl font-bold"></h3>
                <button id="publicDetailClose" class="text-xl leading-none text-zinc-400 hover:text-zinc-200">&times;</button>
            </div>
            <div id="publicDetailAuthor" class="text-xs text-zinc-400 mb-2"></div>
            <div class="mb-3">
                <div class="text-[10px] text-zinc-400 uppercase mb-1">标签</div>
                <div id="publicDetailTags" class="flex flex-wrap gap-1 text-xs"></div>
            </div>
            <div class="mb-4">
                <div class="text-[10px] text-zinc-400 uppercase mb-1">简介</div>
                <div id="publicDetailDesc" class="text-sm text-zinc-200 leading-relaxed max-h-40 overflow-auto"></div>
            </div>
            <div class="flex gap-3">
                <button id="publicDetailImport" class="flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white shadow shadow-amber-500/30 transition-all">导入并开始聊天</button>
            </div>
        </div>
    `;
    document.body.appendChild(detailModal);
    return detailModal;
}

function fillPublicCardDetailModal(detailModal, card) {
    document.getElementById('publicDetailName').textContent = card.name || '';
    document.getElementById('publicDetailAuthor').textContent = '作者: ' + (card.author || '—');

    const tagsDiv = document.getElementById('publicDetailTags');
    tagsDiv.innerHTML = '';
    (card.tags || []).forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'px-2 py-0.5 bg-white/10 rounded text-xs';
        pill.textContent = tag;
        tagsDiv.appendChild(pill);
    });

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
        const importedChar = state.characters[(card.name || '').toLowerCase().trim()];
        if (importedChar) {
            loadOrCreateChatForCharacter(importedChar);
        }
    };
}
