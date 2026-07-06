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
