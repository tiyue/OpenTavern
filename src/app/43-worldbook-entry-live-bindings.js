// ==================== World Book Entry Field Bindings ====================
function bindWIEntryLiveInput(id, prop, isNum) {
    var el = dom[id];
    if (!el) return;
    el.addEventListener('input', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        if (!entry) return;
        var val = isNum ? (parseInt(this.value, 10) || 0) : this.value;
        entry[prop] = val;
        if (prop === 'position' && entry.extensions) entry.extensions.position = val;
        if (prop === 'depth' && entry.extensions) entry.extensions.depth = val;
        wiState.dirty = true;
        renderWIEntryList(dom.wiSearch.value.trim());
    });
}

function bindWorldBookEntryLiveFields() {
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

    if (dom.wiContent) {
        dom.wiContent.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            if (!entry) return;
            entry.content = this.value;
            wiState.dirty = true;
            updateWIDirtyIndicator();
        });
    }

    bindWorldBookEntryCheckboxes();
    bindWorldBookEntryStrategyControls();
    bindWorldBookEntryPositionControls();
    bindWorldBookEntryMatchControls();
}

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
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            if (!entry) return;
            var path = pair[1];
            if (path.indexOf('.') > -1) {
                var parts = path.split('.');
                if (!entry[parts[0]]) entry[parts[0]] = {};
                entry[parts[0]][parts[1]] = this.checked;
            } else {
                entry[path] = this.checked;
            }
            wiState.dirty = true;
            renderWIEntryList(dom.wiSearch.value.trim());
        });
    });
}

function bindWorldBookEntryStrategyControls() {
    dom.wiStratConstant.addEventListener('click', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.constant = true;
        entry.selective = false;
        wiState.dirty = true;
        updateStrategyButtons(entry);
        renderWIEntryList(dom.wiSearch.value.trim());
    });
    dom.wiStratSelective.addEventListener('click', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.constant = false;
        entry.selective = true;
        wiState.dirty = true;
        updateStrategyButtons(entry);
        renderWIEntryList(dom.wiSearch.value.trim());
    });
}

function bindWorldBookEntryPositionControls() {
    dom.wiPosition.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.position = parseInt(this.value, 10) || 0;
        if (entry.extensions) entry.extensions.position = entry.position;
        wiState.dirty = true;
        updatePositionConditionalRows(entry.position);
        renderWIEntryList(dom.wiSearch.value.trim());
    });

    dom.wiRole.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.role = parseInt(this.value, 10) || 0;
        if (entry.extensions) entry.extensions.role = entry.role;
        wiState.dirty = true;
    });

    dom.wiProbability.addEventListener('input', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.probability = parseInt(this.value, 10) || 100;
        if (entry.extensions) entry.extensions.probability = entry.probability;
        dom.wiProbVal.textContent = entry.probability;
        wiState.dirty = true;
    });

    dom.wiSelectiveLogic.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.selectiveLogic = parseInt(this.value, 10) || 0;
        wiState.dirty = true;
    });
}

function bindWorldBookEntryMatchControls() {
    var matchCbs = ['wiMatchCharDesc','wiMatchCharPers','wiMatchScenario','wiMatchPersona','wiMatchCharNote','wiMatchCreatorNotes'];
    var matchProps = ['matchCharacterDescription','matchCharacterPersonality','matchScenario','matchPersonaDescription','matchCharacterDepthPrompt','matchCreatorNotes'];
    matchCbs.forEach(function(id, i) {
        var el = dom[id];
        if (!el) return;
        el.addEventListener('change', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            entry[matchProps[i]] = this.checked;
            if (entry.extensions) entry.extensions[matchProps[i].replace(/([A-Z])/g, '_$1').toLowerCase()] = this.checked;
            wiState.dirty = true;
        });
    });
}
