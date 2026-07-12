/**
 * 新手导读（文件：44-worldbook-timed-effects.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、定时效果、联动效果”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `getConversationMessageCount(conv)`、`processTimedEffects(conv, activatedEntries)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== Timed Effects Helpers (Sticky / Cooldown / Delay) ====================
function getConversationMessageCount(conv) {
    if (!conv || !conv.messages) return 0;
    return conv.messages.filter(function(m) { return m.role !== 'system'; }).length;
}

function processTimedEffects(conv, activatedEntries) {
    if (!conv || !activatedEntries || activatedEntries.length === 0) return activatedEntries;

    if (!conv._wiTimedEffects) conv._wiTimedEffects = {};

    var currentCount = getConversationMessageCount(conv);
    var finalEntries = [];
    var timed = conv._wiTimedEffects;

    for (var i = 0; i < activatedEntries.length; i++) {
        var e = activatedEntries[i];
        var uid = String(e.uid);
        var state = timed[uid] || { sticky: 0, cooldown: 0, delay: 0, lastActivated: 0 };

        var delay = e.delay || 0;
        var sticky = e.sticky || 0;
        var cooldown = e.cooldown || 0;

        var canActivate = true;

        // Delay check
        if (delay > 0 && currentCount < delay) {
            canActivate = false;
        }

        // Cooldown check
        if (state.cooldown > currentCount) {
            canActivate = false;
        }

        // Sticky: if still active, force include (ignore probability later in activation)
        if (state.sticky > currentCount) {
            canActivate = true; // force
        }

        if (canActivate) {
            finalEntries.push(e);

            // Update state after successful activation consideration
            if (sticky > 0) {
                state.sticky = currentCount + sticky;
            }
            if (cooldown > 0) {
                state.cooldown = (state.sticky > currentCount ? state.sticky : currentCount) + cooldown;
            }
            state.lastActivated = currentCount;

            timed[uid] = state;
        }
    }

    // Clean up expired effects
    Object.keys(timed).forEach(function(uid) {
        var s = timed[uid];
        if (s.sticky <= currentCount && s.cooldown <= currentCount) {
            delete timed[uid];
        }
    });

    return finalEntries;
}
