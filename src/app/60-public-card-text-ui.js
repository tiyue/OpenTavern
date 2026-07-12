/**
 * 新手导读（文件：60-public-card-text-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、文本、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `escapeHtml(str)`、`highlightMatch(text, query)`、`updateCardLibraryCount(shown, total)`、`openCardLibrary(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Card Text Helpers ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="bg-amber-500/30 text-amber-300 rounded px-0.5">$1</span>');
}

function updateCardLibraryCount(shown, total) {
    const countEl = dom.cardLibraryResultCount;
    if (!countEl) return;
    if (!shown || shown === total) {
        countEl.textContent = `共 ${total} 个`;
    } else {
        countEl.textContent = `找到 ${shown} 个 / 共 ${total}`;
    }
}

function openCardLibrary() {
    // (stub: old left public library removed)
    if (typeof switchView === 'function') switchView('library');
    if (typeof setActiveTab === 'function') setActiveTab('public');
    return;
}
