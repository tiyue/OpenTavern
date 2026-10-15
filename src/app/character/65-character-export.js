/**
 * 新手导读（文件：65-character-export.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“角色、导出”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `exportCharacter(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
// ==================== Character Card Export ====================
function cloneCharacterCardExportValue(value, fallback) {
    if (value == null) return fallback;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return fallback; }
}

function buildCharacterCardExportPayload(character, characterBook) {
    var c = character || {};
    var data = {
        name: c.name || '',
        nickname: c.nickname || '',
        description: c.description || '',
        personality: c.personality || '',
        scenario: c.scenario || '',
        first_mes: c.first_mes || '',
        mes_example: c.mes_example || '',
        system_prompt: c.system_prompt || '',
        post_history_instructions: c.post_history_instructions || '',
        creator_notes: c.creator_notes || '',
        tags: Array.isArray(c.tags) ? c.tags.slice() : [],
        creator: c.creator || '',
        character_version: c.character_version || '1.0',
        alternate_greetings: Array.isArray(c.alternate_greetings) ? c.alternate_greetings.slice() : [],
        group_only_greetings: Array.isArray(c.group_only_greetings) ? c.group_only_greetings.slice() : [],
        assets: cloneCharacterCardExportValue(c.assets, []),
        extensions: cloneCharacterCardExportValue(c.extensions, {})
    };
    if (c.creator_notes_multilingual && typeof c.creator_notes_multilingual === 'object') {
        data.creator_notes_multilingual = cloneCharacterCardExportValue(c.creator_notes_multilingual, {});
    }
    if (c.source != null) data.source = cloneCharacterCardExportValue(c.source, c.source);
    if (characterBook) {
        data.character_book = characterBook;
        if (characterBook.name) data.extensions.world = characterBook.name;
    }
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: data,
        create_date: new Date().toISOString()
    };
}

function exportCharacter() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    if (!c) return;

    var characterBook = getCharacterBookForExport(conv);
    var card = buildCharacterCardExportPayload(c, characterBook);

    if (characterBook) {
        console.log('[Character Export] 已自动嵌入 character_book，共 ' + characterBook.entries.length + ' 条目');
    }

    var blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (c.name || 'character').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '_card.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
