// ==================== Character Import ====================
function importCharacterCard(jsonData) {
    if (!jsonData) throw new Error(t('import_invalid_format'));

    let data = null;
    let detectedVersion = 'unknown';

    // V3
    if (jsonData.spec === 'chara_card_v3' && jsonData.data) {
        detectedVersion = 'v3';
        data = jsonData.data;
    }
    // V2
    else if (jsonData.spec === 'chara_card_v2' && jsonData.data) {
        detectedVersion = 'v2';
        data = jsonData.data;
    }
    // V1（扁平）或无 spec 的旧格式
    else if (jsonData.name && (jsonData.description || jsonData.personality || jsonData.first_mes)) {
        detectedVersion = 'v1';
        data = jsonData; // 直接使用扁平对象
    }
    // 兜底：尝试从 data 里拿（有些工具导出不规范）
    else if (jsonData.data && jsonData.data.name) {
        detectedVersion = 'unknown-wrapped';
        data = jsonData.data;
    }

    if (!data) {
        throw new Error(t('import_invalid_format'));
    }
    if (!data.name) {
        throw new Error(t('import_missing_name'));
    }

    // 归一化成 OpenTavern 内部使用的角色对象
    // 强制将文本字段转为字符串，防止来自某些导出卡的非字符串值导致 .replace 报错
    const character = {
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

    console.log('[Import] 检测到角色卡版本:', detectedVersion, 'name:', character.name);
    return character;
}

/**
 * 从 chara_card (v1/v2/v3) 中提取内嵌的世界书 (character_book) 数据，
 * 并创建为全局可复用的 World Book，然后返回创建的 book 对象。
 * 支持 v3/v2 的 data.character_book 以及 v1/扁平格式的根级 character_book。
 * 如果没有内嵌世界书或没有有效条目，则返回 null。
 */
function importCharacterBookFromCard(jsonData, characterName) {
    if (!jsonData) return null;

    var cb = null;
    if (jsonData.data && jsonData.data.character_book) {
        cb = jsonData.data.character_book;
    } else if (jsonData.character_book) {
        // 兼容 v1 扁平格式或非标准导出（character_book 直接在根）
        cb = jsonData.character_book;
    }

    if (!cb) {
        return null;
    }
    // 复用现有的归一化逻辑（支持 entries 为数组或对象）
    var normalized = normalizeImportedWorldInfo(cb);

    if (!normalized || !normalized.entries || Object.keys(normalized.entries).length === 0) {
        return null;
    }

    // 智能命名：优先使用 character_book 自带的 name，其次用角色名 + 后缀
    var bookName = (cb && cb.name) || (characterName ? (characterName + ' 的世界书') : 'Imported Character Book');

    // 创建全局世界书
    var book = createNewWorldBook(bookName);
    book.entries = normalized.entries;

    // 如果 normalized 有名字也尊重它
    if (normalized.name) {
        book.name = normalized.name;
    }

    return book;
}

/**
 * 从 SillyTavern PNG 角色卡文件中提取嵌入的 character 数据。
 * 支持常见的 "chara" / "ccv3" tEXt / iTXt chunk（base64 编码的 JSON）。
 * 返回可直接传给 importCharacterCard 的 JSON 对象。
 */
async function extractCharaFromPng(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // PNG signature
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
        if (bytes[i] !== sig[i]) throw new Error('Not a valid PNG file');
    }

    let offset = 8;
    while (offset < bytes.length) {
        const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        const chunkData = bytes.slice(offset + 8, offset + 8 + length);

        if (type === 'tEXt' || type === 'iTXt') {
            // keyword is null-terminated
            let keywordEnd = 0;
            while (keywordEnd < chunkData.length && chunkData[keywordEnd] !== 0) keywordEnd++;
            const keyword = new TextDecoder('utf-8').decode(chunkData.slice(0, keywordEnd));
            if (keyword === 'chara' || keyword === 'ccv3') {
                const valueBytes = chunkData.slice(keywordEnd + 1);
                const b64 = new TextDecoder('utf-8').decode(valueBytes);
                // base64 -> bytes -> string
                const binary = atob(b64);
                const decoded = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    decoded[i] = binary.charCodeAt(i);
                }
                const jsonStr = new TextDecoder('utf-8').decode(decoded);
                return JSON.parse(jsonStr);
            }
        }

        offset += 12 + length;
        if (type === 'IEND') break;
    }

    throw new Error('No SillyTavern character data found in PNG (missing chara/ccv3 chunk)');
}

function replacePlaceholders(text, charName, userName) {
    text = String(text || '');
    if (!text) return '';
    return text
        .replace(/\{\{char\}\}/gi, charName || '')
        .replace(/\{\{user\}\}/gi, userName || 'User');
}

function getEffectivePostHistoryInstructions(character, stage) {
    var settings = state && state.settings ? state.settings : {};
    var customPostHistory = stage === 'second'
        ? String(settings.twoStagePostHistoryInstructions || '').trim()
        : String(settings.postHistoryInstructions || '').trim();
    if (customPostHistory) return customPostHistory;
    return character ? String(character.post_history_instructions || '') : '';
}
