/**
 * 新手导读（文件：40-character-book-import.js）
 *
 * 负责什么：这是“角色卡导入”中的“角色、资料库、导入”部分。
 * 在程序中的位置：它解析 PNG 或 JSON 角色卡，把角色设定和角色世界书转换成内部格式。
 * 从哪里开始看：主要从 `getEmbeddedCharacterBook(jsonData)`、`getImportedCharacterBookName(characterBook, characterName)`、`importCharacterBookFromCard(jsonData, characterName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：外部文件不可信；读取字段时要允许缺失值并避免直接执行其中的内容。
 */
// ==================== Character Book Import ====================
function getEmbeddedCharacterBook(jsonData) {
    if (!jsonData) return null;
    if (jsonData.data && jsonData.data.character_book) return jsonData.data.character_book;
    if (jsonData.character_book) return jsonData.character_book;
    return null;
}

function getImportedCharacterBookName(characterBook, characterName) {
    return (characterBook && characterBook.name) ||
        (characterName ? (characterName + ' 的世界书') : 'Imported Character Book');
}

function importCharacterBookFromCard(jsonData, characterName) {
    var cb = getEmbeddedCharacterBook(jsonData);
    if (!cb) return null;

    var normalized = normalizeImportedWorldInfo(cb);
    if (!normalized || !normalized.entries || Object.keys(normalized.entries).length === 0) {
        return null;
    }

    var book = createNewWorldBook(getImportedCharacterBookName(cb, characterName));
    book.entries = normalized.entries;

    if (normalized.name) {
        book.name = normalized.name;
    }

    return book;
}
