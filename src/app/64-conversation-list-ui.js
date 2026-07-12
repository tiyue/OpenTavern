/**
 * 新手导读（文件：64-conversation-list-ui.js）
 *
 * 负责什么：这是“会话列表”中的“会话、列表、界面”部分。
 * 在程序中的位置：它计算会话摘要信息并渲染侧边栏中的聊天记录。
 * 从哪里开始看：主要从 `renderConversationList(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：列表项标识必须稳定，否则重命名或删除可能作用到错误会话。
 */
// ==================== Conversation List UI ====================
function renderConversationList() {
    if (!dom.convList) return;
    var order = getVisibleConversationListOrder();

    if (order.length === 0) {
        dom.convList.innerHTML = buildConversationListEmptyHtml();
        return;
    }
    var html = '';
    for (var i = 0; i < order.length; i++) {
        var id = order[i], conv = state.conversations[id];
        if (!conv) continue;
        var isActive = id === state.activeConvId;
        html += buildConversationListItemHtml(id, conv, isActive);
    }
    dom.convList.innerHTML = html;
    dom.convList.querySelectorAll('[data-conv-id]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            var id = el.getAttribute('data-conv-id');
            if (id) loadConversation(id);
        });
    });
    dom.convList.querySelectorAll('.conv-delete-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-del-id');
            if (id) deleteConversation(id);
        });
    });
    dom.convList.querySelectorAll('.conv-export-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-exp-id');
            if (id) exportConversation(id);
        });
    });
}
