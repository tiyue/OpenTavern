/**
 * 新手导读（文件：20-storage-idb-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `normalizeIDBStorageData(data)`、`getIDBStorageInfo(storage)`、`runIDBStorageTransaction(db, storage, mode, action, messages)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== IndexedDB Storage Helpers ====================
function normalizeIDBStorageData(data) {
    const value = data && data.data ? data.data : data;
    if (value && !value.lastSaved) value.lastSaved = Date.now();
    return value || null;
}

function idbStorageSnapshotMatches(stored, candidate) {
    if (!stored || !candidate) return stored === candidate;
    try {
        const storedValue = JSON.parse(JSON.stringify(stored));
        const candidateValue = JSON.parse(JSON.stringify(candidate));
        // 旧调用方可能不带 lastSaved；读取路径会补上它，比较时忽略这个补出的值。
        if (!candidateValue.lastSaved) {
            delete storedValue.lastSaved;
            delete candidateValue.lastSaved;
        }
        return JSON.stringify(storedValue) === JSON.stringify(candidateValue);
    } catch (_) {
        return false;
    }
}

async function getIDBStorageInfo(storage) {
    try {
        const data = await storage.loadAll({ fresh: true });
        return { backend: 'idb', used: data ? new Blob([JSON.stringify(data)]).size : 0 };
    } catch (_) {
        return { backend: 'idb', used: 0 };
    }
}

function runIDBStorageTransaction(db, storage, mode, action, messages) {
    messages = messages || {};
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        let tx = null;

        const clearTransactionTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        const succeed = (value) => {
            if (settled) return;
            settled = true;
            clearTransactionTimer();
            resolve(value);
        };
        const fail = (error, knownAborted) => {
            if (settled) return;
            settled = true;
            clearTransactionTimer();
            let abortFailed = false;
            if (tx) {
                // 原生 onabort 事件已发生表示回滚已知，不再重复中止；其他失败先请求中止，
                // 中止失败意味着事务可能已经完成，不能断言回滚成功。
                if (!knownAborted) {
                    try { tx.abort(); } catch (_) { abortFailed = true; }
                }
                try {
                    tx.oncomplete = null;
                    tx.onerror = null;
                    tx.onabort = null;
                } catch (_) {}
            }
            // 只读事务不修改数据；中止失败仍可按普通失败重试，只有写事务需要核对未知的提交结果。
            if (abortFailed && mode === 'readwrite') {
                const uncertain = new Error((error && error.message ? error.message : 'IndexedDB transaction failed') +
                    '; abort failed, transaction completion is uncertain');
                uncertain.idbAbortUncertain = true;
                if (error && error.name) uncertain.name = error.name;
                if (error && error.code) uncertain.code = error.code;
                reject(uncertain);
                return;
            }
            reject(error);
        };

        try {
            tx = db.transaction(storage._storeName, mode);
            timer = setTimeout(() => {
                timer = null;
                fail(new Error(messages.timeout || 'IndexedDB transaction timed out'));
            }, IDB_STORAGE_TRANSACTION_TIMEOUT_MS);
            tx.onerror = () => fail(tx.error || new Error(messages.error || 'IndexedDB transaction failed'));
            tx.onabort = () => fail(tx.error || new Error(messages.abort || 'IndexedDB transaction aborted'), true);
            action(tx, succeed, fail);
        } catch (e) {
            fail(e);
        }
    });
}
