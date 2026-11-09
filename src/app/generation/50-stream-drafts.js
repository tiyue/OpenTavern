// Private, local recovery records are separate from conversation and cloud snapshots.
var streamDraftDbPromise = null;
var streamDraftPending = new Map();
var streamDraftWriteQueue = Promise.resolve();
var streamDraftFlushTimer = null;
// 与本地存储相同的固定内部期限：不新增用户配置，只让挂起的打开/事务有界失败。
var STREAM_DRAFT_OPEN_TIMEOUT_MS = 5000;
var STREAM_DRAFT_TRANSACTION_TIMEOUT_MS = 5000;

function openStreamDraftDatabase() {
    if (streamDraftDbPromise) return streamDraftDbPromise;
    var promise = new Promise(function(resolve, reject) {
        var settled = false;
        var timer = null;
        var request = null;
        var fail = function(error) {
            if (settled) return;
            settled = true;
            if (timer) { clearTimeout(timer); timer = null; }
            reject(error);
        };
        if (typeof indexedDB === 'undefined') { fail(new Error('浏览器不支持草稿恢复存储。')); return; }
        timer = setTimeout(function() {
            timer = null;
            fail(new Error('草稿恢复存储打开超时。'));
        }, STREAM_DRAFT_OPEN_TIMEOUT_MS);
        try {
            request = indexedDB.open('opentavern-stream-drafts-v1', 1);
        } catch (error) {
            fail(error);
            return;
        }
        request.onupgradeneeded = function() { request.result.createObjectStore('drafts', { keyPath: 'id' }); };
        request.onsuccess = function() {
            if (settled) {
                // 超时后迟到的连接只关闭，不接入缓存，也不执行等待中的写入。
                try { request.result.close(); } catch (_) {}
                return;
            }
            settled = true;
            if (timer) { clearTimeout(timer); timer = null; }
            resolve(request.result);
        };
        request.onerror = function() { fail(request.error || new Error('草稿恢复存储打开失败。')); };
        request.onblocked = function() { fail(new Error('草稿恢复存储打开被占用。')); };
    });
    streamDraftDbPromise = promise;
    // 失败后清掉缓存，下一次操作可以真正重开；成功的连接继续复用。
    promise.catch(function() { if (streamDraftDbPromise === promise) streamDraftDbPromise = null; });
    return promise;
}

function streamDraftStorage(method, value) {
    return openStreamDraftDatabase().then(function(db) {
        return new Promise(function(resolve, reject) {
            var settled = false;
            var timer = null;
            var tx = null;
            var request = null;
            var succeed = function(result) {
                if (settled) return;
                settled = true;
                if (timer) { clearTimeout(timer); timer = null; }
                resolve(result);
            };
            var fail = function(error) {
                if (settled) return;
                settled = true;
                if (timer) { clearTimeout(timer); timer = null; }
                if (tx) {
                    // 超时/失败后尽可能中止迟到写入，并摘掉监听，保证只结算一次。
                    try { tx.abort(); } catch (_) {}
                    try { tx.oncomplete = null; tx.onerror = null; tx.onabort = null; } catch (_) {}
                }
                reject(error);
            };
            try {
                tx = db.transaction('drafts', method === 'getAll' ? 'readonly' : 'readwrite');
                timer = setTimeout(function() { timer = null; fail(new Error('草稿恢复存储事务超时。')); }, STREAM_DRAFT_TRANSACTION_TIMEOUT_MS);
                tx.oncomplete = function() { succeed(request && request.result); };
                tx.onerror = tx.onabort = function() { fail(tx.error || (request && request.error) || new Error('草稿保存失败。')); };
                request = tx.objectStore('drafts')[method](value);
            } catch (error) {
                // 连接已被关闭或替换时丢弃缓存，让下一次操作重新打开而不是永久失败。
                if (streamDraftDbPromise) streamDraftDbPromise = null;
                fail(error);
            }
        });
    });
}

function streamDraftSource(conv) {
    return fingerprintMessageText(JSON.stringify((conv.messages || []).map(function(message) {
        return [message.id, getMessageRevision(message), message.selectedResponseVersionId, message.selectedUserVersionId];
    })));
}

function queueStreamDraft(generationContext, content, cot, toolTrace) {
    var conv = generationContext && generationContext.conversation;
    var hasTrace = typeof hasModelToolTrace === 'function' && hasModelToolTrace(toolTrace);
    if (!conv || !isLiveConversation(conv) || generationContext._streamDraftClosed || (!String(content || '').trim() && !hasTrace)) return;
    var record = generationContext._streamDraft;
    if (!record) {
        var parent = (conv.messages || []).slice().reverse().find(function(message) { return message.role === 'assistant' && message.stage !== 'second'; });
        record = generationContext._streamDraft = { id: makeId(), conversationId: conv.id, title: conv.title || '聊天', source: streamDraftSource(conv), stage: generationContext.stage || 'main', parentId: parent && parent.id, created: Date.now() };
    }
    record = Object.assign({}, record, { content: String(content || ''), cot: String(cot || ''), updated: Date.now() });
    if (hasTrace) record.toolTrace = normalizeModelToolTrace(toolTrace);
    generationContext._streamDraft = record;
    streamDraftPending.set(record.id, record);
    if (!streamDraftFlushTimer) streamDraftFlushTimer = setTimeout(function() { flushStreamDraftWrites().catch(reportStreamDraftError); }, 2000);
}

function reportStreamDraftError(error) { console.warn('[StreamDraft] 未完成回复的本机恢复副本未能保存：', error && error.message); }

function flushStreamDraftWrites() {
    clearTimeout(streamDraftFlushTimer); streamDraftFlushTimer = null;
    var records = Array.from(streamDraftPending.values()); streamDraftPending.clear();
    var run = function() {
        return Promise.all(records.map(function(record) {
            return streamDraftStorage('put', record).catch(function(error) { if (!streamDraftPending.has(record.id)) streamDraftPending.set(record.id, record); throw error; });
        }));
    };
    streamDraftWriteQueue = streamDraftWriteQueue.then(run, run);
    return streamDraftWriteQueue;
}

function finishStreamDraft(generationContext) {
    var record = generationContext && generationContext._streamDraft;
    if (!record) return Promise.resolve();
    generationContext._streamDraftClosed = true;
    streamDraftPending.delete(record.id);
    var remove = function() { streamDraftPending.delete(record.id); return streamDraftStorage('delete', record.id); };
    // 只有先前的挂起写入成功后才删除；写入失败/超时保留可恢复记录，
    // 且不在同一轮清理里再次等待阻塞的打开。清理本身也必须有限收尾，
    // 不能因为更早排队的重试而让主消息 ACK 后的生成状态一直等待。
    var queued = streamDraftWriteQueue.then(remove);
    streamDraftWriteQueue = queued;
    return new Promise(function(resolve) {
        var timer = setTimeout(function() { timer = null; resolve(); }, STREAM_DRAFT_OPEN_TIMEOUT_MS);
        queued.then(function() {
            if (timer) { clearTimeout(timer); timer = null; }
            resolve();
        }, function(error) {
            if (timer) { clearTimeout(timer); timer = null; }
            reportStreamDraftError(error);
            resolve();
        });
    });
}

async function recoverStreamDraft(record) {
    var conv = record && state.conversations[record.conversationId];
    if (!conv || state.isGenerating) throw new Error('原会话不存在或正在生成，请稍后重试。');
    var hasTrace = typeof hasModelToolTrace === 'function' && hasModelToolTrace(record.toolTrace);
    if (typeof record.content !== 'string' || (!record.content.trim() && !hasTrace) || typeof record.id !== 'string') throw new Error('恢复草稿格式无效。');
    var existing = conv.messages.some(function(message) { return message.recoveryDraftId === record.id || (message.responseVersions || []).some(function(version) { return version.message && version.message.recoveryDraftId === record.id; }); });
    if (!existing) {
        if (streamDraftSource(conv) !== record.source) throw new Error('原消息已变化。请导出此草稿以保留内容，不能直接接入当前历史。');
        var message = { id: makeId(), role: 'assistant', content: record.content, cot: record.cot || '', interrupted: true, recoveryDraftId: record.id };
        if (hasTrace) message.toolTrace = normalizeModelToolTrace(record.toolTrace);
        if (record.stage === 'second') {
            if (!conv.messages.some(function(parent) { return parent.id === record.parentId && parent.stage !== 'second'; })) throw new Error('第二阶段的原回复已变化。');
            message.stage = 'second'; message.parentId = record.parentId;
        }
        await persistConversationMessageMutation(conv, function(candidate) { candidate.messages.push(message); return message; }, {
            validate: function(current) { return !state.isGenerating && streamDraftSource(current) === record.source; }
        });
    }
    await streamDraftStorage('delete', record.id);
    if (getActiveConv() === conv) renderMessagesOnly();
    renderConversationListOnly();
}

async function showStreamDraftRecovery() {
    var records = await streamDraftStorage('getAll');
    var dialog = openFeatureDialog('streamDraftRecoveryDialog', '未完成回复恢复', '<p class="feature-hint">这些内容仅保存在本机。保存到原会话后会标记为未完成；原历史变化时可先导出。</p><div data-stream-drafts></div>', null);
    var host = dialog.querySelector('[data-stream-drafts]');
    records.sort(function(a, b) { return b.updated - a.updated; });
    records.forEach(function(record) {
        var row = document.createElement('div'); row.className = 'feature-row';
        var summary = document.createElement('span'); summary.textContent = record.title + ' · ' + String(record.content).slice(0, 100);
        row.appendChild(summary);
        [['保存到原会话', async function() { await recoverStreamDraft(record); }], ['导出', function() { downloadJsonFile(record, 'opentavern-recovered-draft.json'); }], ['丢弃', async function() { await streamDraftStorage('delete', record.id); }]].forEach(function(item) {
            var button = document.createElement('button'); button.type = 'button'; button.textContent = item[0];
            button.addEventListener('click', async function() {
                button.disabled = true;
                try { await item[1](); if (item[0] !== '导出') row.remove(); await refreshStreamDraftRecoveryNotice(); }
                catch (error) { alert(error.message); } finally { button.disabled = false; }
            }); row.appendChild(button);
        }); host.appendChild(row);
    });
    if (!records.length) host.textContent = '没有待恢复的回复。';
}

async function refreshStreamDraftRecoveryNotice() {
    var records = await streamDraftStorage('getAll');
    var button = document.getElementById('streamDraftRecoveryBtn');
    if (!records.length) { if (button) button.remove(); return; }
    if (!button && dom.messagesContainer) {
        button = document.createElement('button'); button.type = 'button'; button.id = 'streamDraftRecoveryBtn'; button.className = 'feature-hint px-3 py-2';
        button.addEventListener('click', function() { showStreamDraftRecovery().catch(function(error) { alert(error.message); }); });
        dom.messagesContainer.before(button);
    }
    if (button) button.textContent = '发现 ' + records.length + ' 份未完成回复 · 查看恢复';
}
