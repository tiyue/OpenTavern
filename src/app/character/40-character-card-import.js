/**
 * 新手导读（文件：40-character-card-import.js）
 *
 * 负责什么：这是“角色卡导入”中的“角色、角色卡、导入”部分。
 * 在程序中的位置：它解析 PNG 或 JSON 角色卡，把角色设定和角色世界书转换成内部格式。
 * 从哪里开始看：主要从 `getCharacterCardPayload(jsonData)`、`detectCharacterCardVersion(jsonData)`、`normalizeImportedCharacterCardData(data)`、`importCharacterCard(jsonData)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：外部文件不可信；读取字段时要允许缺失值并避免直接执行其中的内容。
 */
// ==================== Character Card Import ====================
function getCharacterCardPayload(jsonData) {
    if (!jsonData) return null;

    if (jsonData.spec === 'chara_card_v3' && jsonData.data) return jsonData.data;
    if (jsonData.spec === 'chara_card_v2' && jsonData.data) return jsonData.data;
    if (jsonData.name && (jsonData.description || jsonData.personality || jsonData.first_mes)) return jsonData;
    if (jsonData.data && jsonData.data.name) return jsonData.data;
    return null;
}

function detectCharacterCardVersion(jsonData) {
    if (!jsonData) return 'unknown';
    if (jsonData.spec === 'chara_card_v3' && jsonData.data) return 'v3';
    if (jsonData.spec === 'chara_card_v2' && jsonData.data) return 'v2';
    if (jsonData.name && (jsonData.description || jsonData.personality || jsonData.first_mes)) return 'v1';
    if (jsonData.data && jsonData.data.name) return 'unknown-wrapped';
    return 'unknown';
}

function cloneImportedCharacterCardValue(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function normalizeImportedCharacterStringArray(value) {
    return Array.isArray(value) ? value.map(function(item) { return String(item); }) : [];
}

function normalizeImportedCharacterCardData(data, rawCard, detectedVersion) {
    var extensions = data.extensions && typeof data.extensions === 'object' && !Array.isArray(data.extensions)
        ? cloneImportedCharacterCardValue(data.extensions)
        : {};
    return {
        name: String(data.name || 'Unnamed'),
        nickname: String(data.nickname || ''),
        description: String(data.description || ''),
        personality: String(data.personality || ''),
        scenario: String(data.scenario || ''),
        first_mes: String(data.first_mes || ''),
        mes_example: String(data.mes_example || ''),
        system_prompt: String(data.system_prompt || ''),
        post_history_instructions: String(data.post_history_instructions || ''),
        creator_notes: String(data.creator_notes || ''),
        creator_notes_multilingual: data.creator_notes_multilingual && typeof data.creator_notes_multilingual === 'object'
            ? cloneImportedCharacterCardValue(data.creator_notes_multilingual)
            : undefined,
        creator: String(data.creator || ''),
        character_version: String(data.character_version || ''),
        source: cloneImportedCharacterCardValue(data.source),
        tags: normalizeImportedCharacterStringArray(data.tags),
        alternate_greetings: normalizeImportedCharacterStringArray(data.alternate_greetings),
        group_only_greetings: normalizeImportedCharacterStringArray(data.group_only_greetings),
        assets: Array.isArray(data.assets) ? cloneImportedCharacterCardValue(data.assets) : [],
        extensions: extensions,
        rawCard: cloneImportedCharacterCardValue(rawCard),
        _cardVersion: detectedVersion || 'unknown',
        regexScriptsEnabled: false,
        regexScriptsPromptEnabled: false,
        regexScriptsPrompted: false
    };
}

function importCharacterCard(jsonData) {
    if (!jsonData) throw new Error(t('import_invalid_format'));

    var data = getCharacterCardPayload(jsonData);
    var detectedVersion = detectCharacterCardVersion(jsonData);

    if (!data) {
        throw new Error(t('import_invalid_format'));
    }
    if (!data.name) {
        throw new Error(t('import_missing_name'));
    }

    const character = normalizeImportedCharacterCardData(data, jsonData, detectedVersion);
    if (data.character_book && typeof data.character_book === 'object') {
        character.character_book = cloneImportedCharacterCardValue(data.character_book);
    }
    console.log('[Import] Detected character card version', detectedVersion, 'name:', character.name);
    return character;
}
