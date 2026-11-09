/**
 * 新手导读（文件：20-retrieval-index-store.js）
 *
 * 负责什么：这是“语义检索”中的“本机派生索引”部分。
 * 在程序中的位置：它把可重建的片段向量保存在独立 IndexedDB 数据库，不进入应用 canonical 快照或云同步。
 * 从哪里开始看：主要从 `openRetrievalIndexDatabase()`、`readRetrievalIndexSnapshot(signature)`、`writeRetrievalIndexSource(record, chunks)` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：打开和事务都必须有截止时间；源原文不在这里，清索引不能删除用户资料。
 */
// ==================== Retrieval Index Store ====================
var RETRIEVAL_INDEX_DB_NAME = 'opentavern-retrieval-index';
var RETRIEVAL_INDEX_DB_VERSION = 1;
var RETRIEVAL_INDEX_OPEN_TIMEOUT_MS = 4000;
var RETRIEVAL_INDEX_TRANSACTION_TIMEOUT_MS = 8000;
var retrievalIndexDb = null;
var retrievalIndexOpenPromise = null;
var retrievalIndexMemoryStore = null;

function isRetrievalIndexQuotaError(error) {
    if (!error) return false;
    var name = String(error.name || '');
    var message = String(error.message || '');
    return name === 'QuotaExceededError' || /quota|storage.*full|exceeded/i.test(message);
}

function getRetrievalIndexMemoryStore() {
    if (!retrievalIndexMemoryStore) {
        retrievalIndexMemoryStore = { sources: new Map(), chunks: new Map() };
    }
    return retrievalIndexMemoryStore;
}

function closeRetrievalIndexDatabase() {
    var db = retrievalIndexDb;
    retrievalIndexDb = null;
    retrievalIndexOpenPromise = null;
    if (!db) return;
    try { db.close(); } catch (_) {}
}

function discardRetrievalIndexDatabase(db) {
    if (!db) return;
    if (retrievalIndexDb === db) {
        retrievalIndexDb = null;
        retrievalIndexOpenPromise = null;
    }
    try { db.close(); } catch (_) {}
}

function openRetrievalIndexDatabase() {
    if (retrievalIndexDb) return Promise.resolve(retrievalIndexDb);
    if (retrievalIndexOpenPromise) return retrievalIndexOpenPromise;
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    var attempt = { settled: false };
    var openPromise = new Promise(function(resolve, reject) {
        var request;
        var timer = null;
        function fail(error) {
            if (attempt.settled) return;
            attempt.settled = true;
            if (timer) { clearTimeout(timer); timer = null; }
            if (retrievalIndexOpenPromise === chained) retrievalIndexOpenPromise = null;
            reject(error);
        }
        try {
            request = indexedDB.open(RETRIEVAL_INDEX_DB_NAME, RETRIEVAL_INDEX_DB_VERSION);
        } catch (error) {
            fail(error);
            return;
        }
        timer = setTimeout(function() {
            fail(new Error('打开检索索引数据库超时。'));
        }, RETRIEVAL_INDEX_OPEN_TIMEOUT_MS);
        request.onupgradeneeded = function() {
            var db = request.result;
            if (!db.objectStoreNames.contains('sources')) {
                var sources = db.createObjectStore('sources', { keyPath: 'sourceKey' });
                sources.createIndex('signature', 'signature', { unique: false });
            }
            if (!db.objectStoreNames.contains('chunks')) {
                var chunks = db.createObjectStore('chunks', { keyPath: 'id' });
                chunks.createIndex('signature', 'signature', { unique: false });
                chunks.createIndex('sourceKey', 'sourceKey', { unique: false });
            }
        };
        request.onsuccess = function() {
            var db = request.result;
            if (attempt.settled) {
                try { if (db && typeof db.close === 'function') db.close(); } catch (_) {}
                return;
            }
            attempt.settled = true;
            if (timer) { clearTimeout(timer); timer = null; }
            db.onversionchange = function() {
                try { db.close(); } catch (_) {}
                if (retrievalIndexDb === db) retrievalIndexDb = null;
            };
            db.onclose = function() {
                if (retrievalIndexDb === db) retrievalIndexDb = null;
            };
            resolve(db);
        };
        request.onerror = function() {
            fail(request.error || new Error('无法打开检索索引数据库。'));
        };
        request.onblocked = function() {
            fail(new Error('检索索引数据库版本变更被其他页面阻塞。'));
        };
    });
    var chained;
    chained = openPromise.then(function(db) {
        if (retrievalIndexOpenPromise === chained) retrievalIndexOpenPromise = null;
        retrievalIndexDb = db;
        return db;
    }, function(error) {
        if (retrievalIndexOpenPromise === chained) retrievalIndexOpenPromise = null;
        throw error;
    });
    retrievalIndexOpenPromise = chained;
    return chained;
}

function runRetrievalIndexTransaction(storeNames, mode, worker) {
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    return openRetrievalIndexDatabase().then(function(db) {
        if (!db) return null;
        return new Promise(function(resolve, reject) {
            var transaction;
            try {
                transaction = db.transaction(storeNames, mode);
            } catch (error) {
                if (error && error.name === 'InvalidStateError') discardRetrievalIndexDatabase(db);
                reject(error);
                return;
            }
            var settled = false;
            var transactionDone = false;
            var workerDone = false;
            var workerValue;
            var timer = null;
            function settle(error, value) {
                if (settled) return;
                settled = true;
                if (timer) { clearTimeout(timer); timer = null; }
                if (error) reject(error);
                else resolve(value);
            }
            function maybeResolve() {
                if (transactionDone && workerDone) settle(null, workerValue);
            }
            function abortUncertain(error) {
                settle(error);
                try { transaction.abort(); } catch (_) {}
                discardRetrievalIndexDatabase(db);
            }
            var result;
            transaction.oncomplete = function() {
                transactionDone = true;
                maybeResolve();
            };
            transaction.onerror = function() {
                if (settled) return;
                settle(transaction.error || new Error('检索索引事务失败。'));
            };
            transaction.onabort = function() {
                if (settled) return;
                settle(transaction.error || new Error('检索索引事务已中止。'));
            };
            timer = setTimeout(function() {
                abortUncertain(new Error('检索索引事务超时。'));
            }, RETRIEVAL_INDEX_TRANSACTION_TIMEOUT_MS);
            try {
                result = worker(transaction);
            } catch (error) {
                workerDone = true;
                abortUncertain(error);
                return;
            }
            Promise.resolve(result).then(function(value) {
                workerDone = true;
                workerValue = value;
                maybeResolve();
            }, function(error) {
                workerDone = true;
                abortUncertain(error);
            });
        });
    }, function(error) {
        if (error && error.name === 'InvalidStateError') closeRetrievalIndexDatabase();
        throw error;
    });
}

function requestToPromise(request) {
    return new Promise(function(resolve, reject) {
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function() { reject(request.error || new Error('检索索引读写失败。')); };
    });
}

async function readRetrievalIndexSources(signature) {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        var sources = [];
        getRetrievalIndexMemoryStore().sources.forEach(function(record) {
            if (!signature || record.signature === signature) sources.push(JSON.parse(JSON.stringify(record)));
        });
        return sources;
    }
    return runRetrievalIndexTransaction(['sources'], 'readonly', function(transaction) {
        var store = transaction.objectStore('sources');
        return signature ? requestToPromise(store.index('signature').getAll(signature)) : requestToPromise(store.getAll());
    }).then(function(records) { return records || []; });
}

async function readRetrievalIndexChunks(signature) {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        var chunks = [];
        getRetrievalIndexMemoryStore().chunks.forEach(function(record) {
            if (!signature || record.signature === signature) chunks.push(JSON.parse(JSON.stringify(record)));
        });
        return chunks;
    }
    return runRetrievalIndexTransaction(['chunks'], 'readonly', function(transaction) {
        var store = transaction.objectStore('chunks');
        return signature ? requestToPromise(store.index('signature').getAll(signature)) : requestToPromise(store.getAll());
    }).then(function(records) { return records || []; });
}

async function readRetrievalIndexSnapshot(signature) {
    var values = await Promise.all([readRetrievalIndexSources(signature), readRetrievalIndexChunks(signature)]);
    return { sources: values[0] || [], chunks: values[1] || [] };
}

async function readRetrievalIndexSourceRecord(sourceKey) {
    if (!sourceKey) return null;
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        var record = getRetrievalIndexMemoryStore().sources.get(sourceKey);
        return record ? JSON.parse(JSON.stringify(record)) : null;
    }
    return runRetrievalIndexTransaction(['sources'], 'readonly', function(transaction) {
        return requestToPromise(transaction.objectStore('sources').get(sourceKey));
    });
}

function deleteRetrievalIndexSourceChunksInTransaction(transaction, sourceKey) {
    var chunksStore = transaction.objectStore('chunks');
    var index = chunksStore.index('sourceKey');
    return new Promise(function(resolve, reject) {
        var request = index.openCursor(IDBKeyRange.only(sourceKey));
        request.onsuccess = function() {
            var cursor = request.result;
            if (!cursor) { resolve(); return; }
            cursor.delete();
            cursor.continue();
        };
        request.onerror = function() { reject(request.error || new Error('删除旧检索片段失败。')); };
    });
}

async function writeRetrievalIndexSource(record, chunks) {
    if (!record || !record.sourceKey) throw new Error('检索索引来源记录无效。');
    var normalizedChunks = (chunks || []).map(function(chunk, index) {
        return Object.assign({}, chunk, {
            id: record.sourceKey + '#' + index,
            sourceKey: record.sourceKey,
            sourceType: record.sourceType,
            sourceId: record.sourceId,
            revision: record.revision,
            signature: record.signature,
            chunkIndex: index
        });
    });
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        var memory = getRetrievalIndexMemoryStore();
        memory.sources.set(record.sourceKey, JSON.parse(JSON.stringify(record)));
        memory.chunks.forEach(function(value, key) { if (value.sourceKey === record.sourceKey) memory.chunks.delete(key); });
        normalizedChunks.forEach(function(chunk) { memory.chunks.set(chunk.id, JSON.parse(JSON.stringify(chunk))); });
        return normalizedChunks.length;
    }
    await runRetrievalIndexTransaction(['sources', 'chunks'], 'readwrite', function(transaction) {
        var sourcesStore = transaction.objectStore('sources');
        var chunksStore = transaction.objectStore('chunks');
        return deleteRetrievalIndexSourceChunksInTransaction(transaction, record.sourceKey).then(function() {
            return requestToPromise(sourcesStore.put(record));
        }).then(function() {
            return Promise.all(normalizedChunks.map(function(chunk) { return requestToPromise(chunksStore.put(chunk)); }));
        });
    });
    return normalizedChunks.length;
}

async function deleteRetrievalIndexSource(sourceKey) {
    if (!sourceKey) return false;
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        var memory = getRetrievalIndexMemoryStore();
        var existed = memory.sources.delete(sourceKey);
        memory.chunks.forEach(function(value, key) { if (value.sourceKey === sourceKey) { memory.chunks.delete(key); existed = true; } });
        return existed;
    }
    await runRetrievalIndexTransaction(['sources', 'chunks'], 'readwrite', function(transaction) {
        return deleteRetrievalIndexSourceChunksInTransaction(transaction, sourceKey).then(function() {
            return requestToPromise(transaction.objectStore('sources').delete(sourceKey));
        });
    });
    return true;
}

async function clearRetrievalIndexDatabase() {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
        retrievalIndexMemoryStore = null;
        return;
    }
    await runRetrievalIndexTransaction(['sources', 'chunks'], 'readwrite', function(transaction) {
        return Promise.all([
            requestToPromise(transaction.objectStore('sources').clear()),
            requestToPromise(transaction.objectStore('chunks').clear())
        ]);
    });
}

async function countRetrievalIndexRecords() {
    var snapshot = await readRetrievalIndexSnapshot('');
    return { sources: snapshot.sources.length, chunks: snapshot.chunks.length };
}

function isRetrievalIndexMemoryBackend() {
    return typeof indexedDB === 'undefined' || !indexedDB;
}
