/**
 * 新手导读（文件：60-library-card-filter.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、角色卡、筛选”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getCardOrientation(tags)`、`passesLibraryFilter(card)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 角色卡筛选公共逻辑：按名称、标签、简介、作者和所属分组匹配关键词。
function passesLibraryFilter(card) {
    const q = (librarySearchQuery || '').toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (card.name || '').toLowerCase().includes(q);
    const tagsMatch = (card.tags || []).some(function(tag) {
        return (tag || '').toLowerCase().includes(q);
    });
    const descMatch = (card.description || card.personality || '').toLowerCase().includes(q);
    const displayAuthor = activeLibraryTab === 'public'
        ? PUBLIC_CARD_DISPLAY_AUTHOR
        : (card.author || card.creator || '');
    const authorMatch = displayAuthor.toLowerCase().includes(q);
    const groupMatch = (card.academyZh || card.academy || card.chapter || '').toLowerCase().includes(q);
    return nameMatch || tagsMatch || descMatch || authorMatch || groupMatch;
}
