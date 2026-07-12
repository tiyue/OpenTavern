/**
 * 新手导读（文件：60-library-card-display-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、角色卡、显示、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getLibraryCardDisplayName(card)`、`getLibraryCardInitial(card)`、`formatLibraryCardTags(tags)`、`createLibraryCardInfo(card)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 角色卡显示辅助：统一名称、描述、标签和图片等界面展示字段。
function getLibraryCardDisplayName(card) {
    return (card && card.name) || 'Unnamed';
}

function getLibraryCardInitial(card) {
    return ((card && card.name) || '?').charAt(0).toUpperCase();
}

function formatLibraryCardTags(tags) {
    return (tags || []).slice(0, 3).join(' · ');
}

function createLibraryCardInfo(card) {
    const info = document.createElement('div');
    info.className = 'p-2';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium text-zinc-100 truncate';
    name.textContent = getLibraryCardDisplayName(card);

    const tags = document.createElement('div');
    tags.className = 'text-[10px] text-zinc-400 mt-0.5 truncate';
    tags.textContent = formatLibraryCardTags(card && card.tags);

    info.appendChild(name);
    info.appendChild(tags);
    return info;
}
