// ==================== World Book Entry Strategy Bindings ====================
function bindWorldBookEntryStrategyControls() {
    dom.wiStratConstant.addEventListener('click', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.constant = true;
        entry.selective = false;
        wiState.dirty = true;
        updateStrategyButtons(entry);
        renderWIEntryList(dom.wiSearch.value.trim());
    });
    dom.wiStratSelective.addEventListener('click', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        entry.constant = false;
        entry.selective = true;
        wiState.dirty = true;
        updateStrategyButtons(entry);
        renderWIEntryList(dom.wiSearch.value.trim());
    });
}
