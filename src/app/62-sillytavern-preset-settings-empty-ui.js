// ==================== SillyTavern Preset Settings Empty UI ====================
function renderSillyTavernPresetEmptyState() {
    dom.stPresetStatus.textContent = t('settings_st_preset_empty');
    dom.stPresetList.innerHTML = '<div class="text-[11px] text-zinc-600 px-1 py-1">' + escapeHtml(t('settings_st_preset_empty')) + '</div>';
    setSillyTavernPresetTransferButtonsDisabled(true);
}

function setSillyTavernPresetTransferButtonsDisabled(disabled) {
    [dom.stPresetExportBtn, dom.stPresetDeleteBtn].forEach(function(btn) {
        if (!btn) return;
        btn.disabled = !!disabled;
        btn.classList.toggle('opacity-50', !!disabled);
        btn.classList.toggle('cursor-not-allowed', !!disabled);
    });
}
