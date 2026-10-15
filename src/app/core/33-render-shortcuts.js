/**
 * 新手导读（文件：33-render-shortcuts.js）
 *
 * 负责什么：这是“消息完成与界面刷新”中的“渲染、快捷渲染”部分。
 * 在程序中的位置：它在回复完成后更新消息区域，并用订阅把状态变化传给各界面。
 * 从哪里开始看：主要从 `requestFullRender(无参数)`、`requestRender(key)`、`renderMessagesOnly(无参数)`、`renderConversationListOnly(无参数)`、`renderCharacterUI(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：持久化状态与刷新页面的先后顺序会影响用户是否看到最新消息。
 */
// ==================== Render Shortcut Helpers ====================
function requestFullRender() {
    renderAll();
}

function requestRender(key) {
    if (Array.isArray(key)) {
        appStore.notify(key);
    } else {
        appStore.notify([key]);
    }
}

function renderMessagesOnly() {
    if (dom.messagesContainer) renderMessages();
}

function renderConversationListOnly() {
    if (dom.convList) renderConversationList();
}

function renderCharacterUI() {
    renderCharacterCard();
    renderTopBar();
}
