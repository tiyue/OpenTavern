/**
 * 新手导读（文件：60-library-my-card-action-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、操作、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getMyCardActionTileConfigs(无参数)`、`resetMyCardImportModalControls(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 我的角色卡操作配置：定义新建角色与导入角色卡两个操作卡片。
function getMyCardActionTileConfigs() {
    return [
        {
            iconHtml: '＋',
            iconClass: 'text-4xl mb-2 text-amber-400',
            title: '新建角色',
            subtitle: '手动创建',
            onClick: function() {
                if (typeof openCharacterEditor === 'function') openCharacterEditor();
            }
        },
        {
            iconHtml: 'Import',
            iconClass: 'text-xs mb-2 uppercase tracking-wider text-zinc-500',
            title: '导入角色卡',
            subtitle: '从文件',
            onClick: openMyCardImportModal
        }
    ];
}

function resetMyCardImportModalControls() {
    if (dom.importStatus) dom.importStatus.classList.add('hidden');
    if (dom.importFileInput) dom.importFileInput.value = '';
}
