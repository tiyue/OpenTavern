// ==================== World Book Entry Scalar Field Bindings ====================
function bindWIEntryLiveInput(id, prop, isNum) {
    var el = dom[id];
    if (!el) return;
    el.addEventListener('input', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        var val = isNum ? (parseInt(this.value, 10) || 0) : this.value;
        entry[prop] = val;
        syncWorldBookEntryExtensionField(entry, prop, val);
        markWorldBookEntryDirtyAndRenderList();
    });
}

function bindWorldBookEntryScalarFields() {
    bindWIEntryLiveInput('wiComment', 'comment');
    bindWIEntryLiveInput('wiOrder', 'order', true);
    bindWIEntryLiveInput('wiAutomationId', 'automationId');
    bindWIEntryLiveInput('wiGroup', 'group');
    bindWIEntryLiveInput('wiGroupWeight', 'groupWeight', true);
    bindWIEntryLiveInput('wiOutletName', 'outletName');
    bindWIEntryLiveInput('wiDepth', 'depth', true);
    bindWIEntryLiveInput('wiSticky', 'sticky', true);
    bindWIEntryLiveInput('wiCooldown', 'cooldown', true);
    bindWIEntryLiveInput('wiDelay', 'delay', true);
    bindWIEntryLiveInput('wiScanDepth', 'scanDepth', true);
}

function bindWorldBookEntryContentField() {
    if (dom.wiContent) {
        dom.wiContent.addEventListener('input', function() {
            var entry = getSelectedWorldBookEntry();
            if (!entry) return;
            entry.content = this.value;
            wiState.dirty = true;
            updateWIDirtyIndicator();
        });
    }
}
