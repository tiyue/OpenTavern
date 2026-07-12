/**
 * 新手导读（文件：61-chat-history-load-button.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、历史记录、读取、按钮”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `buildLoadEarlierMessagesButtonMarkup(labelText, paddingClass)`、`buildLoadEarlierMessagesButtonHtml(hiddenCount)`、`buildIncrementalLoadEarlierMessagesButtonHtml(hiddenCount)`、`getLoadEarlierMessagesButtonFromDocument(无参数)`、`bindLoadEarlierMessagesButton(loadBtn, conv, container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
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
