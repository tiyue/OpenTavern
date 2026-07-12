/**
 * 新手导读（文件：60-library-card-image-upload-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、角色卡、图片、上传、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getCardImageUploadKey(char)`、`escapeCardImageUploadAltText(text)`、`buildCardImageUploadAvatarHtml(char, dataUrl, roundedClass)`、`isActiveCharacterCardKey(key)`、`refreshActiveCharacterImageAvatars(char, key, dataUrl)`、`updateCardImageUploadAvatarElement(id, char, dataUrl, roundedClass, wrapperClass)`，以及另外 1 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Card Image Upload Helpers ====================
function getCardImageUploadKey(char) {
    return (char && char.name ? char.name : '').trim().toLowerCase();
}

function escapeCardImageUploadAltText(text) {
    return String(text || '').replace(/"/g, '&quot;');
}

function buildCardImageUploadAvatarHtml(char, dataUrl, roundedClass) {
    return `<img src="${dataUrl}" class="w-full h-full object-cover ${roundedClass}" alt="${escapeCardImageUploadAltText(char && char.name)}">`;
}

function isActiveCharacterCardKey(key) {
    return !!(
        typeof currentCharacterName !== 'undefined' &&
        currentCharacterName &&
        getCardImageUploadKey({ name: currentCharacterName }) === key
    );
}

function refreshActiveCharacterImageAvatars(char, key, dataUrl) {
    try {
        if (!isActiveCharacterCardKey(key)) return;
        updateCardImageUploadAvatarElement(
            'charAvatar',
            char,
            dataUrl,
            'rounded-xl',
            'w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10'
        );
        updateCardImageUploadAvatarElement(
            'charCardAvatar',
            char,
            dataUrl,
            'rounded-lg',
            'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10'
        );
    } catch (e) {}
}

function updateCardImageUploadAvatarElement(id, char, dataUrl, roundedClass, wrapperClass) {
    const avatar = document.getElementById(id);
    if (!avatar) return;
    avatar.innerHTML = buildCardImageUploadAvatarHtml(char, dataUrl, roundedClass);
    avatar.className = wrapperClass;
}

function saveMyCharacterPreviewImage(char, dataUrl) {
    const key = getCardImageUploadKey(char);
    if (!(state.characters && state.characters[key])) return false;
    state.characters[key].previewImage = dataUrl;
    persistState(true);
    if (typeof renderMyCards === 'function') renderMyCards();
    refreshActiveCharacterImageAvatars(char, key, dataUrl);
    return true;
}
