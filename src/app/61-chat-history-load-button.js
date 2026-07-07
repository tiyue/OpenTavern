// ==================== Chat History Load Button Helpers ====================
const LOAD_EARLIER_MESSAGES_BUTTON_ID = 'loadEarlierBtn';
const LOAD_EARLIER_MESSAGES_BUTTON_CLASS = 'px-4 py-1.5 text-xs rounded-2xl glass hover:bg-white/10 text-zinc-400 hover:text-zinc-300 transition-all';

function buildLoadEarlierMessagesButtonMarkup(labelText, paddingClass) {
    return '<div class="flex justify-center ' + paddingClass + '">' +
        '<button id="' + LOAD_EARLIER_MESSAGES_BUTTON_ID + '" class="' + LOAD_EARLIER_MESSAGES_BUTTON_CLASS + '">' +
        labelText +
        '</button>' +
        '</div>';
}

function buildLoadEarlierMessagesButtonHtml(hiddenCount) {
    return buildLoadEarlierMessagesButtonMarkup(
        '\u2191 \u52a0\u8f7d\u66f4\u65e9\u7684\u6d88\u606f (' + hiddenCount + ' \u6761\u88ab\u9690\u85cf)',
        'py-3'
    );
}

function buildIncrementalLoadEarlierMessagesButtonHtml(hiddenCount) {
    return buildLoadEarlierMessagesButtonMarkup(
        '\u2191 \u52a0\u8f7d\u66f4\u65e9\u7684\u6d88\u606f\uff08\u8fd8\u6709 ' + hiddenCount + ' \u6761\uff09',
        'py-2'
    );
}

function getLoadEarlierMessagesButtonFromDocument() {
    return document.getElementById(LOAD_EARLIER_MESSAGES_BUTTON_ID);
}

function bindLoadEarlierMessagesButton(loadBtn, conv, container) {
    if (!loadBtn) return;
    loadBtn.addEventListener('click', function() {
        loadMoreHistory(conv, container);
    });
}
