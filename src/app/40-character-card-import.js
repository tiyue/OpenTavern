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
