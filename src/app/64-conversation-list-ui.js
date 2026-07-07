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
