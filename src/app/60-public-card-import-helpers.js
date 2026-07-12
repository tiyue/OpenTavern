/**
 * 新手导读（文件：60-public-card-import-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、导入、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `applyPublicCardImportMetadata(character, cardMeta)`、`storeImportedPublicCardCharacter(character)`、`refreshOpenNewChatPickerAfterPublicCardImport(无参数)`、`refreshPublicCardImportViews(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Card Import Helpers ====================
function applyPublicCardImportMetadata(character, cardMeta) {
    if (cardMeta && cardMeta.previewImage) {
        character.previewImage = resolvePublicCardImageUrl(cardMeta);
    }
    if (cardMeta && cardMeta.author && !character.author) {
        character.author = cardMeta.author;
    }
}

function storeImportedPublicCardCharacter(character) {
    const key = character.name.trim().toLowerCase();
    if (!state.characters) state.characters = {};
    state.characters[key] = JSON.parse(JSON.stringify(character));
}

function refreshOpenNewChatPickerAfterPublicCardImport() {
    const picker = document.getElementById('newChatPickerList');
    const pickerModal = document.getElementById('newChatPickerModal');
    if (picker && pickerModal && !pickerModal.classList.contains('hidden')) {
        showNewChatCharacterPicker();
    }
}

function refreshPublicCardImportViews() {
    if (currentView === 'library' && typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }
    refreshOpenNewChatPickerAfterPublicCardImport();
}
