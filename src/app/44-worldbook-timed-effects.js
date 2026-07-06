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
