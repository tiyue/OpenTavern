// Untrusted patterns execute only in a terminable worker with no host state.
// 装载握手：主线程构造后先提交 { type: 'regex-worker-prepare' }，Worker 只对该消息回 { ready: true }；
// 旧标签页（第 11 版及以前）直接提交正则任务时不得收到 ready，仍按原协议在第一条消息返回 result。
// 任务携带 id 时（新版主线程复用同一个 Worker，用编号区分任务）所有回复原样回带该 id；无 id 时不附加，保持旧协议。
self.onmessage = function(event) {
    var data = event.data;
    if (data && data.type === 'regex-worker-prepare') { self.postMessage({ ready: true }); return; }
    var now = function() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };
    var startedAt = now();
    var reply = function(message) {
        if (data && data.id != null) message.id = data.id;
        self.postMessage(message);
    };
    try {
        var pattern = new RegExp(data.source, data.flags);
        var result = data.text.replace(pattern, function() {
            var args = arguments;
            var value = data.replacement.replace(/\$(\$|&|\d{1,2})/g, function(token, key) {
                if (key === '$') return '$';
                if (key === '&') return String(args[0] || '');
                var index = Number(key);
                return args[index] == null ? token : String(args[index]);
            }).replace(/\{\{match\}\}/gi, String(args[0] || ''));
            data.trimStrings.forEach(function(text) { if (text) value = value.split(text).join(''); });
            return value;
        });
        if (result.length > 1000000) throw new Error('正则输出超过容量限制');
        reply({ result: result, elapsedMs: now() - startedAt });
    } catch (error) { reply({ error: error.message }); }
};
