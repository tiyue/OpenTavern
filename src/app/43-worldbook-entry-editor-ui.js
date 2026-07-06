function addWIKeyFromInput(isPrimary) {
    var input = isPrimary ? dom.wiKeyInput : dom.wiSecInput;
    var val = input.value.trim();
    if (!val || !wiState.selectedUid) return;
    var entry = getActiveWI().entries[wiState.selectedUid];
    var arr = isPrimary ? (entry.key = entry.key || []) : (entry.keysecondary = entry.keysecondary || []);
    // split on comma or just push
    val.split(',').map(function(s){return s.trim();}).filter(Boolean).forEach(function(k) {
        if (arr.indexOf(k) === -1) arr.push(k);
    });
    input.value = '';
    if (isPrimary) wiState.primaryKeys = entry.key.slice();
    else wiState.secondaryKeys = entry.keysecondary.slice();
    wiState.dirty = true;
    renderChips(isPrimary);
    renderWIEntryList(dom.wiSearch.value.trim());
}

function removeWIKey(key, isPrimary) {
    if (!wiState.selectedUid) return;
    var entry = getActiveWI().entries[wiState.selectedUid];
    var arr = isPrimary ? entry.key : entry.keysecondary;
    if (!arr) return;
    var idx = arr.indexOf(key);
    if (idx > -1) arr.splice(idx, 1);
    if (isPrimary) wiState.primaryKeys = entry.key.slice();
    else wiState.secondaryKeys = entry.keysecondary.slice();
    wiState.dirty = true;
    renderChips(isPrimary);
    renderWIEntryList(dom.wiSearch.value.trim());
}

function renderChips(isPrimary) {
    var container = isPrimary ? dom.wiKeyChips : dom.wiSecChips;
    if (!container) return;
    container.innerHTML = '';
    var keys = isPrimary ? wiState.primaryKeys : wiState.secondaryKeys;
    keys.forEach(function(k) {
        var pill = document.createElement('span');
        pill.className = 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-white/10 text-zinc-200 border border-white/10';
        var isRegex = k[0] === '/' && k.lastIndexOf('/') > 0;
        pill.innerHTML = (isRegex ? '<span class="text-emerald-400">Regex</span>' : '') + '<span>' + escapeHtml(k) + '</span><span class="cursor-pointer text-zinc-400 hover:text-red-400 ml-0.5" data-key="' + escapeHtml(k) + '">✕</span>';
        pill.querySelector('span:last-child').addEventListener('click', function(ev) {
            ev.stopPropagation();
            removeWIKey(k, isPrimary);
        });
        container.appendChild(pill);
    });
    if (keys.length === 0) {
        var empty = document.createElement('span');
        empty.className = 'text-xs text-zinc-500 px-1';
        empty.textContent = isPrimary ? '（无关键字 = 仅恒常条目）' : '（无）';
        container.appendChild(empty);
    }
}

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
