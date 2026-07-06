// ==================== My Library Card Controls ====================
function createMyCharacterCardControls(char) {
    const controls = document.createElement('div');
    controls.className = 'my-card-controls absolute top-1 right-1 flex items-center gap-1 z-10';
    controls.appendChild(createMyCharacterImageButton(char));
    controls.appendChild(createMyCharacterDeleteButton(char));
    return controls;
}

function createMyCharacterImageButton(char) {
    const imgBtn = document.createElement('button');
    imgBtn.className = 'char-img-btn text-white/70 hover:text-amber-300 active:text-amber-400 text-sm leading-none p-0.5 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 active:opacity-100 pointer-events-none group-hover:pointer-events-auto active:pointer-events-auto';
    imgBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    imgBtn.title = '导入图片';
    imgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerCardImageUpload(char);
    });
    return imgBtn;
}

function createMyCharacterDeleteButton(char) {
    const delBtn = document.createElement('button');
    delBtn.className = 'char-delete-btn text-white/80 hover:text-red-400 active:text-red-500 text-xl font-bold leading-none p-1 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto';
    delBtn.innerHTML = '×';
    delBtn.title = '移除角色卡';
    delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await confirmAndDeleteMyCharacterCard(char);
    });
    return delBtn;
}

async

async function confirmAndDeleteMyCharacterCard(char) {
    const displayName = char.name || '该角色卡';
    if (!await showGlassConfirm(`\u786e\u5b9a\u4ece\u89d2\u8272\u5e93\u4e2d\u5220\u9664\u300c${displayName}\u300d\uff1f\n\u5df2\u6709\u5bf9\u8bdd\u4e2d\u7684\u89d2\u8272\u5361\u6570\u636e\u4e0d\u4f1a\u53d7\u5f71\u54cd\u3002`, { title: '\u5220\u9664\u89d2\u8272\u5361', danger: true, okText: '\u5220\u9664' })) {
        return;
    }
    const key = (char.name || '').trim().toLowerCase();
    deleteCharacterFromLibrary(key);
    if (typeof renderMyCards === 'function') renderMyCards();
}

function isMyCharacterCardControlClick(e) {
    return !!(
        e.target.closest('.char-img-btn') ||
        e.target.closest('.char-delete-btn') ||
        e.target.closest('button[title="移除角色卡"]')
    );
}
