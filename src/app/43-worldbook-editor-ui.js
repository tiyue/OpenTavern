// ==================== World Book Editor UI ====================
function openWorldBookModal() {
    var conv = getActiveConv();
    if (!conv) { newConversation(); conv = getActiveConv(); }

    wiState.currentConvId = conv.id;
    wiState.currentWorldBookId = null;   // reset when opening
    wiState.selectedUid = null;
    wiState.dirty = false;
    wiState.primaryKeys = [];
    wiState.secondaryKeys = [];

    // Phase 2: If the conversation has assigned world books, open the first one by default
    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        wiState.currentWorldBookId = conv.worldBookIds[0];
    }

    dom.worldBookModal.classList.remove('hidden');
    wiState.modalOpen = true;

    // Phase 2: Start by showing the global world book list
    wiState.viewMode = 'books';
    wiState.currentWorldBookId = null;
    wiState.selectedUid = null;
    wiState.dirty = false;
    updateWIDirtyIndicator();

    renderWIEntryList('');
    showNoSelection();

    // wire dynamic listeners once
    if (!dom.wiBookName._wired) {
        wireWorldBookListeners();
        dom.wiBookName._wired = true;
    }

    updateWorldBookModalHeader();
}

function closeWorldBookModal() {
    if (wiState.dirty) {
        // Use immediate persist so edits (especially content) and structural changes (import/delete) are reliably written before the modal closes / user navigates away.
        persistState(true);
        // 世界书条目有变更，清除激活缓存
        var conv = getActiveConv();
        if (conv) conv._wiCache = null;
    }
    // Reset dirty state after successful commit
    wiState.dirty = false;
    updateWIDirtyIndicator();

    dom.worldBookModal.classList.add('hidden');
    wiState.modalOpen = false;
    wiState.selectedUid = null;
    renderConversationListOnly(); // for count badge
    renderWorldInfoBudgetWarning();
}

function wireWorldBookListeners() {
    // Search
    dom.wiSearch.addEventListener('input', function() { renderWIEntryList(this.value.trim()); });

    // Book name
    dom.wiBookName.addEventListener('input', function() {
        var wi = getActiveWI();
        wi.name = this.value;
        wiState.dirty = true;
        updateWIDirtyIndicator();
    });

    // Buttons
    dom.wiCloseBtn.addEventListener('click', closeWorldBookModal);
    dom.worldBookBackdrop.addEventListener('click', closeWorldBookModal);

    dom.wiAddEntryBtn.addEventListener('click', addNewWIEntry);

    // Phase 2: Create new global world book
    if (dom.wiNewBookBtn) {
        dom.wiNewBookBtn.addEventListener('click', function() {
            const newBook = createNewWorldBook('新建世界书');
            wiState.currentWorldBookId = newBook.id;
            wiState.viewMode = 'entries';
            wiState.dirty = true;
            updateWIDirtyIndicator();
            dom.wiBookName.value = newBook.name;
            renderWIEntryList('');
            showNoSelection();
            updateWorldBookModalHeader();
            persistState(true);
        });
    }

    dom.wiImportBtn.addEventListener('click', function() {
        if (dom.wiImportFile) {
            dom.wiImportFile.click();
        } else {
            console.error('wiImportFile element not found in DOM cache');
        }
    });
    dom.wiExportBtn.addEventListener('click', exportCurrentWorldInfo);
    dom.wiDeleteAllBtn.addEventListener('click', deleteAllWIEntries);

    if (dom.wiImportFile) {
        dom.wiImportFile.addEventListener('change', handleWIFileImport);
    } else {
        console.warn('wiImportFile not cached, import will not work');
    }

    // Editor fields - live sync
    function bindLive(id, prop, isNum) {
        var el = dom[id];
        if (!el) return;
        el.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            if (!entry) return;
            var val = isNum ? (parseInt(this.value, 10) || 0) : this.value;
            entry[prop] = val;
            // sync extensions for common fields
            if (prop === 'position' && entry.extensions) entry.extensions.position = val;
            if (prop === 'depth' && entry.extensions) entry.extensions.depth = val;
            wiState.dirty = true;
            renderWIEntryList(dom.wiSearch.value.trim());
        });
    }

    bindLive('wiComment', 'comment');
    bindLive('wiOrder', 'order', true);
    bindLive('wiAutomationId', 'automationId');
    bindLive('wiGroup', 'group');
    bindLive('wiGroupWeight', 'groupWeight', true);
    bindLive('wiOutletName', 'outletName');
    bindLive('wiDepth', 'depth', true);
    bindLive('wiSticky', 'sticky', true);
    bindLive('wiCooldown', 'cooldown', true);
    bindLive('wiDelay', 'delay', true);
    bindLive('wiScanDepth', 'scanDepth', true);

    // CRITICAL FIX: wiContent (the main entry body) was never wired for live sync!
    // User edits to the big textarea were lost on close.
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

    // Checkboxes
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

    // Strategy buttons
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

    // Position select (shows/hides conditional rows)
    dom.wiPosition.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.position = parseInt(this.value, 10) || 0;
        if (entry.extensions) entry.extensions.position = entry.position;
        wiState.dirty = true;
        updatePositionConditionalRows(entry.position);
        renderWIEntryList(dom.wiSearch.value.trim());
    });

    // Role
    dom.wiRole.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.role = parseInt(this.value, 10) || 0;
        if (entry.extensions) entry.extensions.role = entry.role;
        wiState.dirty = true;
    });

    // Probability slider
    dom.wiProbability.addEventListener('input', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.probability = parseInt(this.value, 10) || 100;
        if (entry.extensions) entry.extensions.probability = entry.probability;
        dom.wiProbVal.textContent = entry.probability;
        wiState.dirty = true;
    });

    // Selective logic
    dom.wiSelectiveLogic.addEventListener('change', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        entry.selectiveLogic = parseInt(this.value, 10) || 0;
        wiState.dirty = true;
    });

    // Additional match checkboxes (direct ids)
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

    // Key chips buttons
    dom.wiAddKeyBtn.addEventListener('click', function() { addWIKeyFromInput(true); });
    dom.wiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); addWIKeyFromInput(true); }
    });
    dom.wiAddSecBtn.addEventListener('click', function() { addWIKeyFromInput(false); });
    dom.wiSecInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); addWIKeyFromInput(false); }
    });

    // Duplicate / Delete current entry
    dom.wiDuplicateBtn.addEventListener('click', duplicateCurrentEntry);
    dom.wiDeleteEntryBtn.addEventListener('click', deleteCurrentEntry);

    // Trigger checkboxes (delegated via class)
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

    // Live sync for char filter text inputs
    if (dom.wiCharNames) dom.wiCharNames.addEventListener('input', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
        cf.names = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
        wiState.dirty = true;
    });
    if (dom.wiCharTags) dom.wiCharTags.addEventListener('input', function() {
        if (!wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
        cf.tags = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
        wiState.dirty = true;
    });
}
