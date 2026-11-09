/**
 * 新手导读（文件：32-retrieval-sources.js）
 *
 * 负责什么：这是“语义检索”中的“来源、分块与稳定身份”部分。
 * 在程序中的位置：它把已保存消息、有效摘要和绑定的资料转换成带修订号的检索来源。
 * 从哪里开始看：主要从 `chunkRetrievalText()`、`buildMemorySourceRecords()`、`buildDocumentSourceRecords()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：来源修订必须来自真实消息/摘要/资料；旧修订不得因后台重建尚未完成而继续注入。
 */
// ==================== Retrieval Sources ====================
var RETRIEVAL_CHUNK_CHARS = 900;
var RETRIEVAL_CHUNK_OVERLAP = 100;
var RETRIEVAL_MAX_CHUNKS_PER_SOURCE = 180;
var RETRIEVAL_MAX_MEMORY_MESSAGES_PER_CONVERSATION = 300;
var RETRIEVAL_MAX_LINKED_MEMORY_CONVERSATIONS = 4;

function retrievalTextFingerprint(text) {
    if (typeof fingerprintMessageText === 'function') return fingerprintMessageText(String(text || ''));
    var a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    var value = String(text || '');
    for (var i = 0; i < value.length; i++) {
        var k = value.charCodeAt(i);
        a = b ^ Math.imul(a ^ k, 597399067);
        b = c ^ Math.imul(b ^ k, 2869860233);
        c = d ^ Math.imul(c ^ k, 951274213);
        d = a ^ Math.imul(d ^ k, 2716044179);
    }
    return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a].map(function(n) {
        return (n >>> 0).toString(16).padStart(8, '0');
    }).join('');
}

function normalizeRetrievalText(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

function findRetrievalChunkBoundary(text, start, desiredEnd) {
    if (desiredEnd >= text.length) return text.length;
    var minimum = start + Math.floor((desiredEnd - start) * 0.6);
    for (var index = desiredEnd; index > minimum; index--) {
        var ch = text.charAt(index - 1);
        if (ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '.' || ch === ';' || ch === '；') return index;
    }
    return desiredEnd;
}

function chunkRetrievalText(text, options) {
    options = options || {};
    var value = normalizeRetrievalText(text);
    if (!value.trim()) return [];
    var size = Math.max(100, Number(options.size) || RETRIEVAL_CHUNK_CHARS);
    var overlap = Math.max(0, Math.min(size - 1, options.overlap === undefined ? RETRIEVAL_CHUNK_OVERLAP : Number(options.overlap)));
    var maxChunks = Math.max(1, Number(options.maxChunks) || RETRIEVAL_MAX_CHUNKS_PER_SOURCE);
    var chunks = [];
    var start = 0;
    while (start < value.length && chunks.length < maxChunks) {
        var end = findRetrievalChunkBoundary(value, start, Math.min(value.length, start + size));
        if (end <= start) end = Math.min(value.length, start + size);
        var chunkText = value.slice(start, end).trim();
        if (chunkText) chunks.push({ text: chunkText, start: start, end: end });
        if (end >= value.length) break;
        var next = end - overlap;
        if (next <= start) next = end;
        start = next;
    }
    return chunks;
}

function getMemorySourceConversationIds(conv) {
    var ids = Array.isArray(conv && conv.memorySourceConversationIds) ? conv.memorySourceConversationIds : [];
    return ids.filter(function(id, index) {
        return typeof id === 'string' && id && id !== (conv && conv.id) && ids.indexOf(id) === index;
    }).slice(0, RETRIEVAL_MAX_LINKED_MEMORY_CONVERSATIONS);
}

function getMemorySourceConversations(conv) {
    var conversations = [];
    if (conv) conversations.push(conv);
    getMemorySourceConversationIds(conv).forEach(function(id) {
        var linked = state.conversations && state.conversations[id];
        if (linked && linked !== conv) conversations.push(linked);
    });
    return conversations;
}

function getConversationCharacterBindingIds(conv) {
    var names = [];
    if (conv && conv.character && conv.character.name) names.push(conv.character.name);
    if (conv && conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach(function(member) {
            if (member && member.character && member.character.name) names.push(member.character.name);
        });
    }
    return names.map(function(name) { return String(name).trim().toLowerCase(); }).filter(function(name, index, list) {
        return name && list.indexOf(name) === index;
    });
}

function buildMemorySourceRecords(conv, options) {
    options = options || {};
    var records = [];
    var conversations = getMemorySourceConversations(conv);
    conversations.forEach(function(sourceConv) {
        if (!sourceConv || !Array.isArray(sourceConv.messages)) return;
        var regular = typeof getSummaryRegularMessages === 'function'
            ? getSummaryRegularMessages(sourceConv)
            : sourceConv.messages.filter(function(message) { return message && message.role !== 'system'; });
        var validSummaries = typeof getValidConversationSummaries === 'function' ? getValidConversationSummaries(sourceConv) : [];
        var coveredIndexes = Object.create(null);
        validSummaries.forEach(function(summary) {
            if (!summary || !summary.id) return;
            var range = typeof getSummarySourceRange === 'function' ? getSummarySourceRange(summary, regular) : null;
            if (!range) return;
            for (var index = range.start; index <= range.end; index++) coveredIndexes[index] = true;
            var revision = 's1:' + retrievalTextFingerprint(JSON.stringify([summary.text, summary.sourceMessages || []])) + ':' + String(summary.text || '').length;
            records.push({
                sourceKey: 'memory:summary:' + sourceConv.id + ':' + summary.id,
                sourceType: 'memory',
                sourceId: summary.id,
                sourceLabel: String(sourceConv.title || t('retrieval_source_untitled_conversation')),
                conversationId: sourceConv.id,
                branchId: sourceConv.branchOf && sourceConv.branchOf.conversationId || '',
                role: 'summary',
                revision: revision,
                chunks: chunkRetrievalText(summary.text, options)
            });
        });
        var candidates = [];
        regular.forEach(function(message, index) {
            if (!message || coveredIndexes[index] || !message.id || message.stage === 'second' || message.role === 'system') return;
            var content = String(message.content || '');
            if (!content.trim()) return;
            candidates.push({ message: message, index: index });
        });
        candidates = candidates.slice(-RETRIEVAL_MAX_MEMORY_MESSAGES_PER_CONVERSATION);
        candidates.forEach(function(item) {
            var message = item.message;
            records.push({
                sourceKey: 'memory:message:' + sourceConv.id + ':' + message.id,
                sourceType: 'memory',
                sourceId: message.id,
                sourceLabel: String(sourceConv.title || t('retrieval_source_untitled_conversation')),
                conversationId: sourceConv.id,
                branchId: sourceConv.branchOf && sourceConv.branchOf.conversationId || '',
                role: message.role,
                order: item.index,
                revision: getMessageRevision(message),
                chunks: chunkRetrievalText(message.content, options)
            });
        });
    });
    return records.filter(function(record) { return record.chunks.length > 0; });
}

function documentMatchesConversationBindings(document, conv) {
    if (!document || !Array.isArray(document.bindings)) return false;
    var characterIds = getConversationCharacterBindingIds(conv);
    return document.bindings.some(function(binding) {
        if (!binding) return false;
        if (binding.scope === 'global') return true;
        if (binding.scope === 'conversation') return binding.targetId === (conv && conv.id);
        if (binding.scope === 'character') return characterIds.indexOf(binding.targetId) >= 0;
        return false;
    });
}

function buildDocumentSourceRecords(conv, options) {
    if (typeof ensureDocumentsState === 'function') ensureDocumentsState();
    var documents = state.documents && typeof state.documents === 'object' ? state.documents : {};
    return Object.keys(documents).map(function(id) { return documents[id]; }).filter(function(document) {
        return document && document.id && document.content && documentMatchesConversationBindings(document, conv);
    }).map(function(document) {
        return {
            sourceKey: 'document:' + document.id,
            sourceType: 'document',
            sourceId: document.id,
            sourceLabel: document.name || document.id,
            conversationId: conv && conv.id || '',
            branchId: '',
            documentFormat: document.format || 'txt',
            revision: document.revision,
            chunks: chunkRetrievalText(document.content, options)
        };
    }).filter(function(record) { return record.chunks.length > 0; });
}

function buildActiveRetrievalSources(conv, options) {
    options = options || {};
    var sources = [];
    if (options.memory !== false) sources = sources.concat(buildMemorySourceRecords(conv, options));
    if (options.documents !== false) sources = sources.concat(buildDocumentSourceRecords(conv, options));
    return sources;
}

function getConversationPromptDedupeState(conv, settings) {
    settings = settings || state.settings;
    var recentIds = Object.create(null);
    var summaryTexts = Object.create(null);
    var coveredMessageIds = Object.create(null);
    if (!conv) return { recentIds: recentIds, summaryTexts: summaryTexts, coveredMessageIds: coveredMessageIds };
    var recent = typeof getRegularPromptMessages === 'function' ? getRegularPromptMessages(conv, settings && settings.contextLength) : [];
    recent.forEach(function(message) {
        var source = message && message.__promptSource;
        if (source && source.id) recentIds[source.id] = true;
    });
    var validSummaries = typeof getValidConversationSummaries === 'function' ? getValidConversationSummaries(conv) : [];
    validSummaries.forEach(function(summary) {
        summaryTexts[normalizeRetrievalText(summary.text).trim()] = true;
        (summary.sourceMessages || []).forEach(function(source) {
            if (source && source.id) coveredMessageIds[source.id] = true;
        });
    });
    return { recentIds: recentIds, summaryTexts: summaryTexts, coveredMessageIds: coveredMessageIds };
}

function isRetrievalSourceStillCurrent(record) {
    if (!record) return false;
    if (record.sourceType === 'document') {
        var document = state.documents && state.documents[record.sourceId];
        return !!document && document.revision === record.revision;
    }
    if (record.sourceType === 'memory' && record.sourceKey.indexOf('memory:message:') === 0) {
        var conversation = state.conversations && state.conversations[record.conversationId];
        if (!conversation || !Array.isArray(conversation.messages)) return false;
        var message = conversation.messages.find(function(item) { return item && item.id === record.sourceId; });
        return !!message && message.stage !== 'second' && message.role !== 'system' &&
            getMessageRevision(message) === record.revision && String(message.content || '').trim() !== '';
    }
    if (record.sourceType === 'memory' && record.sourceKey.indexOf('memory:summary:') === 0) {
        var sourceConversation = state.conversations && state.conversations[record.conversationId];
        if (!sourceConversation) return false;
        var valid = typeof getValidConversationSummaries === 'function' ? getValidConversationSummaries(sourceConversation) : [];
        var summary = valid.find(function(item) { return item && item.id === record.sourceId; });
        if (!summary) return false;
        return ('s1:' + retrievalTextFingerprint(JSON.stringify([summary.text, summary.sourceMessages || []])) + ':' + String(summary.text || '').length) === record.revision;
    }
    return false;
}

async function saveCurrentConversationMemorySources(conv, conversationIds) {
    if (!conv || !isLiveConversation(conv)) throw new Error(t('generation_target_changed'));
    if (conv._messageCommitInProgress) throw new Error(t('retrieval_memory_busy'));
    var ids = Array.isArray(conversationIds) ? conversationIds.filter(function(id, index) {
        return typeof id === 'string' && id && id !== conv.id && state.conversations[id] && conversationIds.indexOf(id) === index;
    }).slice(0, RETRIEVAL_MAX_LINKED_MEMORY_CONVERSATIONS) : [];
    var source = JSON.stringify(conv.messages);
    var candidate = JSON.parse(JSON.stringify(conv));
    candidate.memorySourceConversationIds = ids;
    candidate.updated = Date.now();
    function validate(target) {
        return isLiveConversation(target) && JSON.stringify(target.messages) === source;
    }
    function commit(target, validateOnly) {
        if (!validate(target)) return false;
        if (validateOnly) return true;
        target.memorySourceConversationIds = ids.slice();
        target.updated = candidate.updated;
        return true;
    }
    await persistConversationMutation(conv, function() {}, candidate, commit);
    if (typeof appStore !== 'undefined') appStore.notify('conversations');
    return ids;
}

function describeRetrievalSource(source) {
    if (!source) return '';
    var type = source.sourceType === 'document' ? t('retrieval_source_document') : t('retrieval_source_memory');
    var position = source.chunkIndex != null ? t('retrieval_source_chunk') + ' ' + (Number(source.chunkIndex) + 1) : '';
    return type + ' · ' + String(source.sourceLabel || source.sourceId || '') + (position ? ' · ' + position : '');
}
