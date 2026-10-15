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
var conversationListRowSignature = new WeakMap();

function renderConversationList() {
    if (!dom.convList) return;
    var order = getVisibleConversationListOrder();

    if (order.length === 0) {
        dom.convList.innerHTML = buildConversationListEmptyHtml();
        return;
    }
    // 精简环境（无逐行容器能力）退回整段字符串渲染，保持既有行为。
    if (typeof dom.convList.insertBefore !== 'function') {
        renderConversationListHtml(order);
        return;
    }
    renderConversationListKeyed(order);
}

function renderConversationListHtml(order) {
    var html = '';
    for (var i = 0; i < order.length; i++) {
        var id = order[i], conv = state.conversations[id];
        if (!conv) continue;
        html += buildConversationListItemHtml(id, conv, id === state.activeConvId);
    }
    dom.convList.innerHTML = html;
    bindConversationListRow(dom.convList);
}

// 按会话 ID 复用侧栏行：只重建内容变化的行，其余行保留节点并按目标顺序排列。
function renderConversationListKeyed(order) {
    var container = dom.convList;
    var existing = new Map();
    var children = Array.prototype.slice.call(container.children);
    for (var c = 0; c < children.length; c++) {
        var existingId = children[c].getAttribute('data-conv-id');
        if (existingId) existing.set(existingId, children[c]);
    }
    var desired = [];
    for (var i = 0; i < order.length; i++) {
        var id = order[i], conv = state.conversations[id];
        if (!conv) continue;
        var isActive = id === state.activeConvId;
        // 行签名与选中态分开：正文不变时只切换 active 类，避免整行节点被替换。
        var html = buildConversationListItemHtml(id, conv, false);
        var node = existing.get(id);
        if (node && conversationListRowSignature.get(node) === html) {
            updateConversationListRowActiveState(node, isActive);
            desired.push(node);
            continue;
        }
        var holder = document.createElement('div');
        holder.innerHTML = html;
        var fresh = holder.firstElementChild;
        if (!fresh) continue;
        conversationListRowSignature.set(fresh, html);
        updateConversationListRowActiveState(fresh, isActive);
        bindConversationListRow(fresh);
        desired.push(fresh);
    }
    syncKeyedElementChildren(container, desired);
}

function updateConversationListRowActiveState(node, isActive) {
    if (!node || !node.classList || typeof node.classList.toggle !== 'function') return;
    if (typeof node.classList.contains === 'function' && node.classList.contains('active') === isActive) return;
    node.classList.toggle('active', isActive);
}

function bindConversationListRow(root) {
    root.querySelectorAll('[data-conv-id]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            var id = el.getAttribute('data-conv-id');
            if (id) loadConversation(id);
        });
    });
    root.querySelectorAll('.conv-delete-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-del-id');
            if (id) deleteConversation(id);
        });
    });
    root.querySelectorAll('.conv-export-btn').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = el.getAttribute('data-exp-id');
            if (id) exportConversation(id);
        });
    });
}
