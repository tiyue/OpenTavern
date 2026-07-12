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
// 角色卡筛选公共逻辑：解析性向、标签和关键词并判断卡片是否匹配。
function getCardOrientation(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    const hasFemale = /女|female|futa|娘|女仆|姬/.test(t);
    const hasMale = /男|male|攻|男主|男友/.test(t);
    if (hasFemale && !hasMale) return 'male';
    if (hasMale && !hasFemale) return 'female';
    return 'both';
}

function passesLibraryFilter(card) {
    const q = (librarySearchQuery || '').toLowerCase().trim();
    if (q) {
        const nameMatch = (card.name || '').toLowerCase().includes(q);
        const tagsMatch = (card.tags || []).some(t => (t || '').toLowerCase().includes(q));
        const descMatch = (card.description || card.personality || '').toLowerCase().includes(q);
        const authorMatch = (card.author || '').toLowerCase().includes(q);
        if (!(nameMatch || tagsMatch || descMatch || authorMatch)) return false;
    }
    if (libraryFilter !== 'all') {
        const o = getCardOrientation(card.tags || []);
        if (libraryFilter === 'male' && o !== 'male' && o !== 'both') return false;
        if (libraryFilter === 'female' && o !== 'female' && o !== 'both') return false;
    }
    return true;
}
