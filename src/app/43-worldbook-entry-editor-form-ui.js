// ==================== World Book Entry Editor Form UI ====================
function fillEditorFromEntry(entry) {
    if (!entry) return showNoSelection();

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

    var cf = entry.characterFilter || { isExclude: false, names: [], tags: [] };
    dom.wiCharExclude.checked = !!cf.isExclude;
    dom.wiCharNames.value = (cf.names || []).join(', ');
    dom.wiCharTags.value = (cf.tags || []).join(', ');

    var triggers = entry.triggers || [];
    document.querySelectorAll('#wiEditorForm .wi-trigger').forEach(function(cb) {
        cb.checked = triggers.indexOf(cb.value) !== -1;
    });

    dom.wiMatchCharDesc.checked = !!entry.matchCharacterDescription;
    dom.wiMatchCharPers.checked = !!entry.matchCharacterPersonality;
    dom.wiMatchScenario.checked = !!entry.matchScenario;
    dom.wiMatchPersona.checked = !!entry.matchPersonaDescription;
    dom.wiMatchCharNote.checked = !!entry.matchCharacterDepthPrompt;
    dom.wiMatchCreatorNotes.checked = !!entry.matchCreatorNotes;

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
