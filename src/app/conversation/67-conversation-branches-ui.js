// Branch graph dialog: read-only tree/list, explicit conversation and fork navigation.
function renderConversationBranchNode(node, currentId) {
    var wrapper = document.createElement('div');
    wrapper.className = 'branch-node' + (node.current ? ' branch-node-current' : '');
    var row = document.createElement('div');
    row.className = 'feature-row';
    var info = document.createElement('span');
    var title = document.createElement('strong');
    title.textContent = node.title + (node.current ? ' · ' + t('branch_current') : '');
    info.appendChild(title);
    if (node.fork && node.fork.text) {
        var summary = document.createElement('small');
        summary.textContent = t('branch_fork_summary') + ': ' + node.fork.text;
        info.appendChild(summary);
    }
    if (node.issue) {
        var issue = document.createElement('small');
        issue.className = 'branch-issue';
        issue.textContent = node.issue;
        info.appendChild(issue);
    }
    if (node.fork && node.fork.issue) {
        var forkIssue = document.createElement('small');
        forkIssue.className = 'branch-issue';
        forkIssue.textContent = node.fork.issue;
        info.appendChild(forkIssue);
    }
    row.appendChild(info);
    if (!node.current) {
        var open = document.createElement('button');
        open.type = 'button';
        open.textContent = t('branch_open_conversation');
        open.onclick = function() { openConversationFromBranch(node.conversationId); };
        row.appendChild(open);
    }
    if (node.fork && node.fork.messageId) {
        var fork = document.createElement('button');
        fork.type = 'button';
        fork.textContent = t('branch_view_fork');
        fork.onclick = function() { openBranchForkPoint(node.fork.conversationId, node.fork.messageId); };
        row.appendChild(fork);
    }
    wrapper.appendChild(row);
    if (node.children && node.children.length) {
        var details = document.createElement('details');
        details.open = true;
        var summaryNode = document.createElement('summary');
        summaryNode.textContent = t('branch_children') + ' (' + node.children.length + ')';
        details.appendChild(summaryNode);
        node.children.forEach(function(child) { details.appendChild(renderConversationBranchNode(child, currentId)); });
        wrapper.appendChild(details);
    }
    return wrapper;
}

async function openConversationFromBranch(conversationId) {
    var dialog = document.getElementById('conversationBranchDialog');
    if (dialog) dialog.close();
    await loadConversation(conversationId);
    if (!getActiveConv() || getActiveConv().id !== conversationId) return;
    switchView('chat');
    await new Promise(function(resolve) { requestAnimationFrame(resolve); });
    if (typeof alignChatMessagesToLatestOnEntry === 'function') alignChatMessagesToLatestOnEntry();
}

async function openBranchForkPoint(conversationId, messageId) {
    var dialog = document.getElementById('conversationBranchDialog');
    if (dialog) dialog.close();
    var found = await jumpToConversationMessage(conversationId, messageId);
    if (!found) alert(t('branch_fork_unavailable'));
}

function openConversationBranchDialog() {
    var conv = getActiveConv();
    if (!conv) return;
    var tree = buildConversationBranchTree(conv);
    if (!tree) return;
    var dialog = openFeatureDialog('conversationBranchDialog', t('branch_title'),
        '<p class="feature-hint">' + escapeHtml(t('branch_hint')) + '</p><div class="branch-tree"></div>', null);
    var host = dialog.querySelector('.branch-tree');
    host.appendChild(renderConversationBranchNode(tree.root, tree.currentId));
}

function addConversationBranchChatEntry(parent) {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'conversationBranchEntry';
    button.className = 'feature-entry feature-entry-compact';
    button.textContent = t('branch_entry');
    button.onclick = openConversationBranchDialog;
    parent.appendChild(button);
}
