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
