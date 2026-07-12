/**
 * 新手导读（文件：60-library-my-card-controls-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、控件、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `createMyCharacterCardControls(char)`、`createMyCharacterImageButton(char)`、`createMyCharacterDeleteButton(char)`、`confirmAndDeleteMyCharacterCard(char)`、`isMyCharacterCardControlClick(e)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
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
        e.target.closest('.char-delete-btn')
    );
}
