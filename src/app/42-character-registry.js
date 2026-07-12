/**
 * 新手导读（文件：42-character-registry.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“角色、注册表”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：主要从 `migrateCharactersToRegistry(conversations)`、`getAllAvailableCharacters(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
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
