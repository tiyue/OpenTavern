// ==================== World Book Activation Cache ====================
function buildWorldInfoActivationCacheKey(conv, wi) {
    var messages = conv.messages || [];
    var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    var lastContentHash = lastMsg ? (lastMsg.content || '').slice(0, 64) : '';
    var wiEntryCount = Object.keys(wi.entries).length;

    var fingerprint = '';
    var checkPoints = [0, 1, 2, messages.length - 3, messages.length - 2, messages.length - 1];
    checkPoints.forEach(function(idx) {
        if (idx >= 0 && idx < messages.length) {
            var m = messages[idx];
            fingerprint += (m.role || '') + ':' + (m.content || '').slice(0, 20) + '|';
        }
    });

    return messages.length + '|' + lastContentHash + '|' + wiEntryCount + '|' + fingerprint;
}

function cacheActivatedWorldInfoResult(conv, cacheKey, result) {
    if (!conv) return;
    conv._wiCache = {
        key: cacheKey,
        result: result
    };
}
