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

function normalizeImportedCharacterCardData(data) {
    return {
        name: String(data.name || 'Unnamed'),
        description: String(data.description || ''),
        personality: String(data.personality || ''),
        scenario: String(data.scenario || ''),
        first_mes: String(data.first_mes || ''),
        mes_example: String(data.mes_example || ''),
        system_prompt: String(data.system_prompt || ''),
        post_history_instructions: String(data.post_history_instructions || ''),
        creator_notes: String(data.creator_notes || ''),
        tags: Array.isArray(data.tags) ? data.tags : [],
        alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [],
        extensions: data.extensions || {},
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

    const character = normalizeImportedCharacterCardData(data);
    console.log('[Import] Detected character card version', detectedVersion, 'name:', character.name);
    return character;
}
