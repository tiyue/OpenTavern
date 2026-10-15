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

// 公共角色卡导入的可靠保存：角色与世界书记录先在隔离快照中落盘，确认成功后才提交到 live state。
// 同名记录被并发修改/删除、根对象被恢复清空或写入失败时都不改动现有数据，也不会返回成功。
async function persistImportedPublicCardRecords(character, book) {
    var roots = { characters: state.characters, worldBooks: state.worldBooks };
    var records = [];
    if (character && character.name) records.push({ container: 'characters', key: character.name.trim().toLowerCase(), value: character });
    if (book && book.id) records.push({ container: 'worldBooks', key: book.id, value: book });
    records.forEach(function(record) {
        record.hadValue = Object.prototype.hasOwnProperty.call(state[record.container] || {}, record.key);
        record.previous = record.hadValue ? JSON.stringify(state[record.container][record.key]) : null;
    });
    // 保存前与落盘 ACK 前都校验：根对象被恢复/清空，或同名记录被并发修改/删除时直接拒绝。
    function check() {
        Object.keys(roots).forEach(function(key) {
            if (state[key] !== roots[key]) throw new Error('数据已被恢复或清空，请重试。');
        });
        records.forEach(function(record) {
            var container = state[record.container] || {};
            var hadValue = Object.prototype.hasOwnProperty.call(container, record.key);
            if (hadValue !== record.hadValue || (hadValue && JSON.stringify(container[record.key]) !== record.previous)) {
                throw new Error('同名角色或世界书已变化，请重试。');
            }
        });
    }
    // 只把本次导入的键写进快照；用 defineProperty 写入以避免 __proto__ 等键污染原型。
    function merge(snapshot) {
        records.forEach(function(record) {
            if (!snapshot[record.container]) snapshot[record.container] = {};
            Object.defineProperty(snapshot[record.container], record.key, {
                value: JSON.parse(JSON.stringify(record.value)),
                writable: true, enumerable: true, configurable: true
            });
        });
        return snapshot;
    }
    check();
    var release = typeof beginStorageReplacement === 'function' ? beginStorageReplacement() : null;
    var committed = false;
    try {
        await persistState(true, {
            throwOnError: true,
            transformSnapshot: function(snapshot) { return merge(snapshot); },
            beforePersist: check,
            onPersistSuccess: function() {
                check();
                var applied = merge({ characters: state.characters, worldBooks: state.worldBooks });
                state.characters = applied.characters;
                state.worldBooks = applied.worldBooks;
                committed = true;
            },
            commitPendingSnapshot: function(snapshot) { merge(snapshot); }
        });
    } finally {
        if (release) release();
    }
    return committed;
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
