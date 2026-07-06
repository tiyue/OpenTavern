// ==================== My Library Card Action Tiles ====================
function appendMyCardActionTiles(grid) {
    grid.appendChild(createMyCardActionTile({
        iconHtml: '＋',
        iconClass: 'text-4xl mb-2 text-amber-400',
        title: '新建角色',
        subtitle: '手动创建',
        onClick: () => {
            if (typeof openCharacterEditor === 'function') openCharacterEditor();
        }
    }));

    grid.appendChild(createMyCardActionTile({
        iconHtml: 'Import',
        iconClass: 'text-xs mb-2 uppercase tracking-wider text-zinc-500',
        title: '导入角色卡',
        subtitle: '从文件',
        onClick: openMyCardImportModal
    }));
}

function createMyCardActionTile(options) {
    const card = document.createElement('div');
    card.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-dashed border-amber-500/50 flex flex-col items-center justify-center text-center p-4 aspect-[3/4]';
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
    if (dom.importStatus) dom.importStatus.classList.add('hidden');
    if (dom.importFileInput) dom.importFileInput.value = '';
}
