/**
 * 新手导读（文件：60-library-my-card-preview-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、预览、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `createMyCharacterPreview(char)`、`setMyCharacterPreviewFallback(preview, letter)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== My Library Card Preview UI ====================
function createMyCharacterPreview(char) {
    const preview = document.createElement('div');
    const pSrc = char.previewImage || char.avatar;
    const letter = getLibraryCardInitial(char);

    if (pSrc) {
        preview.className = 'aspect-[3/4] w-full overflow-hidden bg-zinc-900 rounded-t-2xl relative';
        const img = document.createElement('img');
        img.src = pSrc;
        img.className = 'w-full h-full object-cover';
        img.alt = char.name || '';
        img.onerror = () => setMyCharacterPreviewFallback(preview, letter);
        preview.appendChild(img);
    } else {
        setMyCharacterPreviewFallback(preview, letter);
    }

    preview.appendChild(createMyCharacterCardControls(char));
    return preview;
}

function setMyCharacterPreviewFallback(preview, letter) {
    const controls = preview.querySelector('.my-card-controls');
    preview.className = 'aspect-[3/4] w-full ot-avatar-fill flex items-center justify-center text-5xl font-bold text-white rounded-t-2xl relative';
    preview.textContent = letter;
    if (controls) preview.appendChild(controls);
}
