// ==================== World Book Entry Key UI ====================
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
