// ==================== World Book Entry Keyword & Trigger Bindings ====================
function bindWorldBookEntryKeywordControls() {
    dom.wiAddKeyBtn.addEventListener('click', function() {
        addWIKeyFromInput(true);
    });
    dom.wiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWIKeyFromInput(true);
        }
    });
    dom.wiAddSecBtn.addEventListener('click', function() {
        addWIKeyFromInput(false);
    });
    dom.wiSecInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWIKeyFromInput(false);
        }
    });

    dom.wiDuplicateBtn.addEventListener('click', duplicateCurrentEntry);
    dom.wiDeleteEntryBtn.addEventListener('click', deleteCurrentEntry);
}

function bindWorldBookEntryTriggerControls() {
    document.getElementById('wiEditorForm').addEventListener('change', function(e) {
        if (!e.target.classList.contains('wi-trigger') || !wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        if (!entry.triggers) entry.triggers = [];
        var val = e.target.value;
        if (e.target.checked) {
            if (entry.triggers.indexOf(val) === -1) entry.triggers.push(val);
        } else {
            entry.triggers = entry.triggers.filter(function(v) { return v !== val; });
        }
        wiState.dirty = true;
    });
}

function bindWorldBookCharacterFilterControls() {
    if (dom.wiCharNames) {
        dom.wiCharNames.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
            cf.names = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
            wiState.dirty = true;
        });
    }
    if (dom.wiCharTags) {
        dom.wiCharTags.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
            cf.tags = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
            wiState.dirty = true;
        });
    }
}
