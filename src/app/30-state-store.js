/**
 * 新手导读（文件：30-state-store.js）
 *
 * 负责什么：这是“应用状态核心”中的“状态、状态仓库”部分。
 * 在程序中的位置：它定义全局状态、默认设置以及会话增删改查入口。
 * 从哪里开始看：主要从 `createReactiveStore(initialState)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：状态字段会被持久化；新增字段时要同时考虑默认值和旧快照规范化。
 */
// ==================== State Store ====================
function createReactiveStore(initialState) {
    var state = JSON.parse(JSON.stringify(initialState || {}));
    var listeners = {};
    var globalListeners = new Set();

    function notify(changedKeys) {
        changedKeys.forEach(function(key) {
            if (listeners[key]) {
                listeners[key].forEach(function(fn) {
                    try { fn(key); } catch (e) { console.error(e); }
                });
            }
        });

        globalListeners.forEach(function(fn) {
            try { fn(changedKeys); } catch (e) { console.error(e); }
        });
    }

    return {
        get state() {
            return state;
        },

        subscribe: function(keyOrFn, callback) {
            if (typeof keyOrFn === 'function') {
                globalListeners.add(keyOrFn);
                return function unsubscribe() {
                    globalListeners.delete(keyOrFn);
                };
            }

            var key = keyOrFn;
            if (!listeners[key]) {
                listeners[key] = new Set();
            }
            listeners[key].add(callback);

            return function unsubscribe() {
                if (listeners[key]) {
                    listeners[key].delete(callback);
                }
            };
        },

        notify: function(keys) {
            var arr = Array.isArray(keys) ? keys : [keys];
            notify(arr);
        }
    };
}
