// 消息身份与内容修订：旧快照确定性迁移，修订用于变化检测，不用于安全授权。
var messageRevisionCache = new WeakMap();
function fingerprintMessageText(text) {
    var a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (var i = 0; i < text.length; i++) {
        var k = text.charCodeAt(i);
        a = b ^ Math.imul(a ^ k, 597399067);
        b = c ^ Math.imul(b ^ k, 2869860233);
        c = d ^ Math.imul(c ^ k, 951274213);
        d = a ^ Math.imul(d ^ k, 2716044179);
    }
    a = Math.imul(c ^ (a >>> 18), 597399067);
    b = Math.imul(d ^ (b >>> 22), 2869860233);
    c = Math.imul(a ^ (c >>> 17), 951274213);
    d = Math.imul(b ^ (d >>> 19), 2716044179);
    return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a].map(function(n) {
        return (n >>> 0).toString(16).padStart(8, '0');
    }).join('');
}

function getMessageRevision(msg) {
    var content = JSON.stringify([
        msg.role || '', msg.content || '', msg.cot || '', msg.speaker || '',
        msg.stage || (msg.role === 'assistant' ? 'main' : ''), msg.parentId || '',
        msg.attachments || null
    ]);
    var cached = messageRevisionCache.get(msg);
    if (cached && cached.content === content) return cached.revision;
    var revision = 'm1:' + fingerprintMessageText(content) + ':' + content.length;
    messageRevisionCache.set(msg, { content: content, revision: revision });
    return revision;
}

function normalizeConversationMessageIdentity(conv) {
    if (!conv || !Array.isArray(conv.messages)) return conv;
    var used = new Set();
    var duplicates = new Set();
    var originalIds = conv.messages.map(function(msg) { return msg && msg.id; });
    var existingIds = new Set(originalIds);
    conv.messages.forEach(function(msg, index) {
        if (!msg || typeof msg !== 'object') return;
        var oldId = msg.id;
        if (typeof oldId !== 'string' || !oldId || used.has(oldId)) {
            if (used.has(oldId)) duplicates.add(oldId);
            var base = 'legacy-' + fingerprintMessageText(JSON.stringify([conv.id || '', index, getMessageRevision(msg)]));
            msg.id = base;
            var suffix = 0;
            while (used.has(msg.id) || existingIds.has(msg.id)) msg.id = base + '-' + (++suffix);
        }
        used.add(msg.id);
    });
    conv.messages.forEach(function(msg, index) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.stage === 'second' && duplicates.has(msg.parentId)) {
            for (var i = index - 1; i >= 0; i--) {
                if (originalIds[i] === msg.parentId && conv.messages[i].stage !== 'second') {
                    msg.parentId = conv.messages[i].id;
                    break;
                }
            }
        }
        msg.revision = getMessageRevision(msg);
    });
    (conv.summaries || []).forEach(function(summary) {
        if (Array.isArray(summary.sourceMessages) && summary.sourceMessages.some(function(source) { return duplicates.has(source.id); })) {
            summary.sourceAmbiguous = true;
        }
    });
    return conv;
}

function isLiveConversation(conv) {
    return !!conv && state.conversations && state.conversations[conv.id] === conv;
}
