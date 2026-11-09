// Read-only branch graph derived from branchOf and stable message IDs.
function getConversationBranchSource(conv) {
    var source = conv && conv.branchOf;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    var conversationId = String(source.conversationId || '');
    if (!conversationId) return null;
    return { conversationId: conversationId, userMessageId: String(source.userMessageId || '') };
}

function getConversationBranchForkSummary(conversationId, messageId) {
    var parent = state.conversations && state.conversations[conversationId];
    if (!parent) return { conversationId: conversationId, messageId: messageId, text: '', issue: t('branch_parent_missing') };
    if (!messageId) return { conversationId: conversationId, messageId: '', text: '', issue: t('branch_message_missing') };
    var message = (parent.messages || []).find(function(item) { return item.id === messageId; });
    if (!message) return { conversationId: conversationId, messageId: messageId, text: '', issue: t('branch_message_missing') };
    var content = String(message.content || '').replace(/\s+/g, ' ').trim();
    return {
        conversationId: conversationId,
        messageId: messageId,
        text: content.length > 120 ? content.slice(0, 120) + '…' : content,
        issue: ''
    };
}

function getConversationBranchChildren(conversationId) {
    return getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations).map(function(id) {
        return state.conversations[id];
    }).filter(function(conv) {
        if (!conv) return false;
        var source = getConversationBranchSource(conv);
        return source && source.conversationId === conversationId;
    }).sort(function(a, b) {
        return (Number(a.created) || Number(a.updated) || 0) - (Number(b.created) || Number(b.updated) || 0);
    });
}

function buildConversationBranchNode(conv, parentFork, path, issues) {
    var node = {
        conversationId: conv.id,
        title: conv.title || t('branch_untitled'),
        current: conv.id === state.activeConvId,
        fork: parentFork || null,
        issue: '',
        children: []
    };
    if (path.indexOf(conv.id) >= 0) {
        node.issue = t('branch_cycle_detected');
        issues.push({ conversationId: conv.id, issue: node.issue });
        return node;
    }
    var nextPath = path.concat([conv.id]);
    getConversationBranchChildren(conv.id).forEach(function(child) {
        var source = getConversationBranchSource(child);
        var fork = getConversationBranchForkSummary(conv.id, source && source.userMessageId);
        var childNode = buildConversationBranchNode(child, fork, nextPath, issues);
        node.children.push(childNode);
    });
    return node;
}

function buildConversationBranchTree(currentConversation) {
    var current = currentConversation || getActiveConv();
    if (!current) return null;
    var chain = [];
    var seen = Object.create(null);
    var cursor = current;
    var issues = [];
    while (cursor) {
        if (seen[cursor.id]) {
            issues.push({ conversationId: cursor.id, issue: t('branch_cycle_detected') });
            break;
        }
        seen[cursor.id] = true;
        chain.push(cursor);
        var source = getConversationBranchSource(cursor);
        if (!source) break;
        var parent = state.conversations && state.conversations[source.conversationId];
        if (!parent) {
            issues.push({ conversationId: cursor.id, issue: t('branch_parent_missing') });
            break;
        }
        cursor = parent;
    }
    var root = chain[chain.length - 1];
    var rootFork = getConversationBranchSource(root) ? getConversationBranchForkSummary(getConversationBranchSource(root).conversationId, getConversationBranchSource(root).userMessageId) : null;
    var tree = buildConversationBranchNode(root, rootFork, [], issues);
    if (rootFork && rootFork.issue) tree.issue = rootFork.issue;
    return { root: tree, currentId: current.id, issues: issues, chainLength: chain.length };
}
