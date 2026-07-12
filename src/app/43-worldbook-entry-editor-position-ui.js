/**
 * 新手导读（文件：43-worldbook-entry-editor-position-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、编辑器、位置、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `updatePositionConditionalRows(pos)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Position UI ====================
function updatePositionConditionalRows(pos) {
    pos = parseInt(pos, 10);
    var depthRow = dom.wiDepthRow;
    var outletRow = dom.wiOutletRow;
    if (!depthRow || !outletRow) return;
    depthRow.classList.toggle('hidden', pos !== WI_POS.AT_DEPTH);
    outletRow.classList.toggle('hidden', pos !== WI_POS.OUTLET);
}
