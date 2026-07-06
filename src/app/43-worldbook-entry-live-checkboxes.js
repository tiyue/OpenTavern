// ==================== World Book Entry Checkbox Bindings ====================
function bindWorldBookEntryCheckboxes() {
    var checkboxes = [
        ['wiDisable', 'disable'],
        ['wiUseProb', 'useProbability'],
        ['wiPrioritize', 'groupOverride'],
        ['wiUseGroupScoring', 'useGroupScoring'],
        ['wiExcludeRec', 'excludeRecursion'],
        ['wiPreventRec', 'preventRecursion'],
        ['wiDelayRec', 'delayUntilRecursion'],
        ['wiCharExclude', 'characterFilter.isExclude'],
        ['wiIgnoreBudget', 'ignoreBudget'],
        ['wiCaseSens', 'caseSensitive'],
        ['wiMatchWhole', 'matchWholeWords']
    ];
    checkboxes.forEach(function(pair) {
        var el = dom[pair[0]];
        if (!el) return;
        el.addEventListener('change', function() {
            var entry = getSelectedWorldBookEntry();
            if (!entry) return;
            setWorldBookEntryPathValue(entry, pair[1], this.checked);
            markWorldBookEntryDirtyAndRenderList();
        });
    });
}
