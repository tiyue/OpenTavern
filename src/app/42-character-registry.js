// ==================== Character Registry Helpers ====================
function migrateCharactersToRegistry(conversations) {
    if (!state.characters) state.characters = {};

    Object.values(conversations || {}).forEach(function(conv) {
        if (conv.character && conv.character.name) {
            const key = conv.character.name.trim().toLowerCase();
            if (!state.characters[key]) {
                state.characters[key] = JSON.parse(JSON.stringify(conv.character));
            }
        }

        if (conv.group && Array.isArray(conv.group.members)) {
            conv.group.members.forEach(function(member) {
                const ch = member && member.character;
                if (ch && ch.name) {
                    const key = ch.name.trim().toLowerCase();
                    if (!state.characters[key]) {
                        state.characters[key] = JSON.parse(JSON.stringify(ch));
                    }
                }
            });
        }
    });
}

function getAllAvailableCharacters() {
    const chars = [];
    const seen = new Set();

    if (state.characters && Object.keys(state.characters).length > 0) {
        Object.values(state.characters).forEach(function(ch) {
            if (ch && ch.name) {
                const key = ch.name.trim().toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    chars.push(JSON.parse(JSON.stringify(ch)));
                }
            }
        });
    } else {
        Object.values(state.conversations || {}).forEach(function(conv) {
            if (conv.character && conv.character.name) {
                const key = conv.character.name.trim().toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    chars.push(JSON.parse(JSON.stringify(conv.character)));
                }
            }
        });
    }

    chars.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });
    return chars;
}
