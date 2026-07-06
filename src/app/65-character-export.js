// ==================== Character Card Export ====================
function exportCharacter() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    if (!c) return;

    var card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: c.name,
            description: c.description,
            personality: c.personality,
            scenario: c.scenario,
            first_mes: c.first_mes,
            mes_example: c.mes_example,
            system_prompt: c.system_prompt,
            post_history_instructions: c.post_history_instructions,
            creator_notes: c.creator_notes,
            tags: c.tags || [],
            creator: '',
            character_version: '1.0',
            alternate_greetings: c.alternate_greetings || [],
            extensions: {}
        },
        create_date: new Date().toISOString()
    };

    var characterBook = getCharacterBookForExport(conv);
    if (characterBook) {
        card.data.character_book = characterBook;

        if (!card.data.extensions) card.data.extensions = {};
        if (characterBook.name) {
            card.data.extensions.world = characterBook.name;
        }
    }

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
