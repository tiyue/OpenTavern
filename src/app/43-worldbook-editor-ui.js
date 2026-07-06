// ==================== World Book Editor Modal ====================
function openWorldBookModal() {
    var conv = getActiveConv();
    if (!conv) { newConversation(); conv = getActiveConv(); }

    wiState.currentConvId = conv.id;
    wiState.currentWorldBookId = null;
    wiState.selectedUid = null;
    wiState.dirty = false;
    wiState.primaryKeys = [];
    wiState.secondaryKeys = [];

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        wiState.currentWorldBookId = conv.worldBookIds[0];
    }

    dom.worldBookModal.classList.remove('hidden');
    wiState.modalOpen = true;
    wiState.viewMode = 'books';
    wiState.currentWorldBookId = null;
    wiState.selectedUid = null;
    wiState.dirty = false;
    updateWIDirtyIndicator();

    renderWIEntryList('');
    showNoSelection();

    if (!dom.wiBookName._wired) {
        wireWorldBookListeners();
        dom.wiBookName._wired = true;
    }

    updateWorldBookModalHeader();
}

function closeWorldBookModal() {
    if (wiState.dirty) {
        persistState(true);
        var conv = getActiveConv();
        if (conv) conv._wiCache = null;
    }

    wiState.dirty = false;
    updateWIDirtyIndicator();

    dom.worldBookModal.classList.add('hidden');
    wiState.modalOpen = false;
    wiState.selectedUid = null;
    renderConversationListOnly();
    renderWorldInfoBudgetWarning();
}

function wireWorldBookListeners() {
    bindWorldBookModalControls();
    bindWorldBookEntryLiveFields();
    bindWorldBookEntryKeywordControls();
    bindWorldBookEntryTriggerControls();
    bindWorldBookCharacterFilterControls();
}
