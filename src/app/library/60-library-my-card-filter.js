/**
 * 新手导读（文件：60-library-my-card-filter.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、筛选”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `buildMyLibraryCharacterFilterCard(character)`、`getFilteredMyLibraryCharacters(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 我的角色卡筛选：把本地角色数据转换为统一的搜索和标签筛选结构。
function buildMyLibraryCharacterFilterCard(character) {
    return {
        name: character.name,
        tags: character.tags,
        description: character.description || character.personality,
        author: character.author || character.creator || character.creator_notes || ''
    };
}

function getFilteredMyLibraryCharacters() {
    var characters = typeof getOrderedMyLibraryCharacters === 'function'
        ? getOrderedMyLibraryCharacters()
        : Object.values(state.characters || {});
    return characters.filter(function(character) {
        return passesLibraryFilter(buildMyLibraryCharacterFilterCard(character));
    });
}
