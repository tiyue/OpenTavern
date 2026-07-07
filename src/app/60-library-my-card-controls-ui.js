// ==================== My Library Card Controls ====================
function createMyCharacterCardControls(char) {
    const controls = document.createElement('div');
    controls.className = 'my-card-controls absolute top-1 right-1 flex items-center gap-1 z-10';
    controls.appendChild(createMyCharacterImageButton(char));
    controls.appendChild(createMyCharacterDeleteButton(char));
    return controls;
}

function createMyCharacterImageButton(char) {
    return createMyCharacterControlButton({
        className: 'char-img-btn text-white/70 hover:text-amber-300 active:text-amber-400 text-sm leading-none p-0.5 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 active:opacity-100 pointer-events-none group-hover:pointer-events-auto active:pointer-events-auto',
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        title: '导入图片',
        onClick: function() {
            triggerCardImageUpload(char);
        }
    });
}

function createMyCharacterDeleteButton(char) {
    return createMyCharacterControlButton({
        className: 'char-delete-btn text-white/80 hover:text-red-400 active:text-red-500 text-xl font-bold leading-none p-1 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
        html: '×',
        title: '移除角色卡',
        onClick: async function() {
            await confirmAndDeleteMyCharacterCard(char);
        }
    });
}

async function confirmAndDeleteMyCharacterCard(char) {
    const confirmConfig = getMyCharacterDeleteConfirmConfig(char);
    if (!await showGlassConfirm(confirmConfig.message, confirmConfig.options)) {
        return;
    }
    deleteCharacterFromLibrary(getMyCharacterCardKey(char));
    if (typeof renderMyCards === 'function') renderMyCards();
}

function isMyCharacterCardControlClick(e) {
    return !!(
        e.target.closest('.char-img-btn') ||
        e.target.closest('.char-delete-btn') ||
        e.target.closest('button[title="移除角色卡"]')
    );
}
