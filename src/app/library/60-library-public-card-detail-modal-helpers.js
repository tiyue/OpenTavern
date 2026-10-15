/**
 * 新手导读（文件：60-library-public-card-detail-modal-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、公共、角色卡、详情、弹窗、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `buildPublicCardDetailModalHtml(无参数)`、`formatPublicCardDetailAuthor(author)`、`getPublicCardDetailModalElements(无参数)`、`hidePublicCardDetailModal(detailModal)`、`importPublicCardDetailAndOpenChat(detailModal, card)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Library Card Detail Modal Helpers ====================
function buildPublicCardDetailModalHtml() {
    return `
        <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" id="publicDetailBackdrop"></div>
        <div class="relative glass rounded-3xl w-[92%] max-w-md p-6 shadow-2xl animate-fade-in">
            <div class="flex justify-between items-center mb-4">
                <h3 id="publicDetailName" class="text-xl font-bold"></h3>
                <button id="publicDetailClose" class="text-xl leading-none text-zinc-400 hover:text-zinc-200">&times;</button>
            </div>
            <div id="publicDetailAuthor" class="text-xs text-zinc-400 mb-2"></div>
            <div class="mb-3">
                <div class="text-[10px] text-zinc-400 uppercase mb-1">标签</div>
                <div id="publicDetailTags" class="flex flex-wrap gap-1 text-xs"></div>
            </div>
            <div class="mb-4">
                <div class="text-[10px] text-zinc-400 uppercase mb-1">简介</div>
                <div id="publicDetailDesc" class="text-sm text-zinc-200 leading-relaxed max-h-40 overflow-auto"></div>
            </div>
            <div class="flex gap-3">
                <button id="publicDetailImport" class="flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white shadow shadow-amber-500/30 transition-all">导入并开始聊天</button>
            </div>
        </div>
    `;
}

function formatPublicCardDetailAuthor(author) {
    return '作者: ' + (author || '—');
}

function getPublicCardDetailModalElements() {
    return {
        name: document.getElementById('publicDetailName'),
        author: document.getElementById('publicDetailAuthor'),
        tags: document.getElementById('publicDetailTags'),
        desc: document.getElementById('publicDetailDesc'),
        close: document.getElementById('publicDetailClose'),
        backdrop: document.getElementById('publicDetailBackdrop'),
        importButton: document.getElementById('publicDetailImport')
    };
}

function hidePublicCardDetailModal(detailModal) {
    detailModal.classList.add('hidden');
}

async function importPublicCardDetailAndOpenChat(detailModal, card) {
    hidePublicCardDetailModal(detailModal);
    const importedChar = await importPublicCard(card) || getImportedPublicCardCharacter(card);
    if (importedChar) {
        loadOrCreateChatForCharacter(importedChar);
    }
}
