// ==================== World Book Entry Position Bindings ====================
function bindWorldBookEntryPositionControls() {
    dom.wiPosition.addEventListener('change', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.position = parseInt(this.value, 10) || 0;
        syncWorldBookEntryExtensionField(entry, 'position', entry.position);
        wiState.dirty = true;
        updatePositionConditionalRows(entry.position);
        renderWIEntryList(dom.wiSearch.value.trim());
    });

    dom.wiRole.addEventListener('change', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.role = parseInt(this.value, 10) || 0;
        syncWorldBookEntryExtensionField(entry, 'role', entry.role);
        wiState.dirty = true;
    });

    dom.wiProbability.addEventListener('input', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.probability = parseInt(this.value, 10) || 100;
        syncWorldBookEntryExtensionField(entry, 'probability', entry.probability);
        dom.wiProbVal.textContent = entry.probability;
        wiState.dirty = true;
    });

    dom.wiSelectiveLogic.addEventListener('change', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.selectiveLogic = parseInt(this.value, 10) || 0;
        wiState.dirty = true;
    });
}
