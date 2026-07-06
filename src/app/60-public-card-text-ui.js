// ==================== Public Card Text Helpers ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="bg-amber-500/30 text-amber-300 rounded px-0.5">$1</span>');
}

function updateCardLibraryCount(shown, total) {
    const countEl = dom.cardLibraryResultCount;
    if (!countEl) return;
    if (!shown || shown === total) {
        countEl.textContent = `共 ${total} 个`;
    } else {
        countEl.textContent = `找到 ${shown} 个 / 共 ${total}`;
    }
}

function openCardLibrary() {
    // (stub: old left public library removed)
    if (typeof switchView === 'function') switchView('library');
    if (typeof setActiveTab === 'function') setActiveTab('public');
    return;
}
