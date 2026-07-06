// ==================== World Book Entry Editor UI ====================
function updateStrategyButtons(entry) {
    if (!entry) return;
    var c = dom.wiStratConstant;
    var s = dom.wiStratSelective;
    if (!c || !s) return;
    var isConst = !!entry.constant;
    c.setAttribute('data-active', isConst ? 'true' : 'false');
    s.setAttribute('data-active', isConst ? 'false' : 'true');
    if (isConst) {
        c.style.borderColor = 'rgba(245,158,11,0.6)';
        s.style.borderColor = '';
    } else {
        s.style.borderColor = 'rgba(245,158,11,0.6)';
        c.style.borderColor = '';
    }
}

function updatePositionConditionalRows(pos) {
    pos = parseInt(pos, 10);
    var depthRow = dom.wiDepthRow;
    var outletRow = dom.wiOutletRow;
    if (!depthRow || !outletRow) return;
    depthRow.classList.toggle('hidden', pos !== WI_POS.AT_DEPTH);
    outletRow.classList.toggle('hidden', pos !== WI_POS.OUTLET);
}

function fillEditorFromEntry(entry) {
    if (!entry) return showNoSelection();

    // Normalize on read so ST/character_book fields (keys, insertion_order, enabled, extensions.*) are visible in editor
    entry = normalizeWIEntry(entry) || entry;

    dom.wiNoSelection.classList.add('hidden');
    dom.wiEditorForm.classList.remove('hidden');

    wiState.primaryKeys = (entry.key || []).slice();
    wiState.secondaryKeys = (entry.keysecondary || []).slice();

    dom.wiComment.value = entry.comment || '';
    dom.wiOrder.value = entry.order != null ? entry.order : 100;
    dom.wiUidBadge.textContent = 'uid:' + entry.uid;

    dom.wiDisable.checked = !!entry.disable;
    dom.wiUseProb.checked = entry.useProbability !== false;
    dom.wiProbability.value = entry.probability != null ? entry.probability : 100;
    dom.wiProbVal.textContent = dom.wiProbability.value;

    dom.wiGroup.value = entry.group || '';
    dom.wiGroupWeight.value = entry.groupWeight != null ? entry.groupWeight : 100;
    dom.wiPrioritize.checked = !!entry.groupOverride;
    dom.wiUseGroupScoring.checked = !!entry.useGroupScoring;

    dom.wiSelectiveLogic.value = entry.selectiveLogic != null ? entry.selectiveLogic : 0;

    dom.wiContent.value = entry.content || '';

    dom.wiPosition.value = entry.position != null ? entry.position : WI_POS.AFTER_CHAR;
    dom.wiDepth.value = entry.depth != null ? entry.depth : 4;
    dom.wiRole.value = entry.role != null ? entry.role : WI_ROLE.SYSTEM;
    dom.wiOutletName.value = entry.outletName || '';

    dom.wiSticky.value = entry.sticky || 0;
    dom.wiCooldown.value = entry.cooldown || 0;
    dom.wiDelay.value = entry.delay || 0;

    dom.wiExcludeRec.checked = !!entry.excludeRecursion;
    dom.wiPreventRec.checked = !!entry.preventRecursion;
    dom.wiDelayRec.checked = !!entry.delayUntilRecursion;

    // character filter
    var cf = entry.characterFilter || { isExclude: false, names: [], tags: [] };
    dom.wiCharExclude.checked = !!cf.isExclude;
    dom.wiCharNames.value = (cf.names || []).join(', ');
    dom.wiCharTags.value = (cf.tags || []).join(', ');

    // triggers
    var triggers = entry.triggers || [];
    document.querySelectorAll('#wiEditorForm .wi-trigger').forEach(function(cb) {
        cb.checked = triggers.indexOf(cb.value) !== -1;
    });

    // match sources
    dom.wiMatchCharDesc.checked = !!entry.matchCharacterDescription;
    dom.wiMatchCharPers.checked = !!entry.matchCharacterPersonality;
    dom.wiMatchScenario.checked = !!entry.matchScenario;
    dom.wiMatchPersona.checked = !!entry.matchPersonaDescription;
    dom.wiMatchCharNote.checked = !!entry.matchCharacterDepthPrompt;
    dom.wiMatchCreatorNotes.checked = !!entry.matchCreatorNotes;

    // advanced
    dom.wiScanDepth.value = entry.scanDepth != null ? entry.scanDepth : '';
    dom.wiCaseSens.checked = entry.caseSensitive === true;
    dom.wiMatchWhole.checked = entry.matchWholeWords === true;
    dom.wiIgnoreBudget.checked = !!entry.ignoreBudget;
    dom.wiAutomationId.value = entry.automationId || '';

    updateStrategyButtons(entry);
    updatePositionConditionalRows(entry.position);
    renderChips(true);
    renderChips(false);
}

function showNoSelection() {
    dom.wiNoSelection.classList.remove('hidden');
    dom.wiEditorForm.classList.add('hidden');
    wiState.selectedUid = null;
    wiState.primaryKeys = [];
    wiState.secondaryKeys = [];
}

function updateEntryFromForm() {
    // called on save/close if needed; most fields are live-bound
    if (!wiState.selectedUid) return;
    var entry = getActiveWI().entries[wiState.selectedUid];
    if (!entry) return;

    // sync characterFilter names/tags from inputs
    var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
    cf.names = (dom.wiCharNames.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
    cf.tags = (dom.wiCharTags.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);

    wiState.dirty = true;
}

// Phase 2: Update modal header to reflect global world book management
function updateWorldBookModalHeader() {
    const titleEl = document.querySelector('#worldBookModal .font-bold.text-lg');
    if (!titleEl) return;

    if (wiState.currentWorldBookId) {
        const wb = state.worldBooks && state.worldBooks[wiState.currentWorldBookId];
        titleEl.textContent = wb ? `世界书：${wb.name || '未命名'}` : '世界书管理器';
    } else {
        titleEl.textContent = '世界书管理器（全局）';
    }
}
