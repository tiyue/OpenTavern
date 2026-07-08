// ==================== My Library Card Action Tiles ====================
function appendMyCardActionTiles(grid) {
    getMyCardActionTileConfigs().forEach(function(options) {
        grid.appendChild(createMyCardActionTile(options));
    });
}

function createMyCardActionTile(options) {
    const card = document.createElement('div');
    card.className = 'my-card-action-tile glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-dashed border-amber-500/50 flex flex-col items-center justify-center text-center p-4 aspect-[3/4]';
    card.innerHTML = `
        <div class="${options.iconClass}">${options.iconHtml}</div>
        <div class="text-sm font-medium">${options.title}</div>
        <div class="text-[10px] text-zinc-400 mt-1">${options.subtitle}</div>
    `;
    card.addEventListener('click', options.onClick);
    return card;
}

function openMyCardImportModal() {
    if (!dom.importModal) return;
    dom.importModal.classList.remove('hidden');
    resetMyCardImportModalControls();
}
