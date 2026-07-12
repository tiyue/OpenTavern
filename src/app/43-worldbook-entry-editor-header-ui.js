/**
 * 新手导读（文件：43-worldbook-entry-editor-header-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、编辑器、标题区域、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `updateWorldBookModalHeader(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Editor Header UI ====================
function updateWorldBookModalHeader() {
    const titleEl = document.querySelector('#worldBookModal .font-bold.text-lg');
    if (!titleEl) return;

    if (wiState.currentWorldBookId) {
        const wb = state.worldBooks && state.worldBooks[wiState.currentWorldBookId];
        titleEl.textContent = wb ? `世界书：${wb.name || '未命名'}` : '世界书管理器';
    } else {
        titleEl.textContent = '世界书管理器（全局）';
    }
}
