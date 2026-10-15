/**
 * 新手导读（文件：70-events-init.js）
 *
 * 负责什么：这是“全局事件初始化”中的“事件、初始化”部分。
 * 在程序中的位置：它集中启动页面事件绑定，并提供发送消息所需的输入辅助。
 * 从哪里开始看：主要从 `sendMessage(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：初始化只能执行一次，否则一个点击会触发多次相同操作。
 */
// ==================== Send Message ====================
/**
 * 用户点击发送按钮或按下发送快捷键后执行的完整入口。
 *
 * 输入/返回：无参数、无返回值；文本来自消息输入框，结果通过异步回调逐步写入界面和会话。
 *
 * 执行顺序：阻止重复生成和空消息 -> 把用户消息加入当前会话 -> 为群聊选择下一位发言人 ->
 * 清空输入框并立即保存 -> 开始远程 API 流式生成 -> 持续更新临时气泡 ->
 * 完成时保存助手消息，失败时移除临时气泡并恢复输入状态。
 *
 * isGenerating 是防止连点产生并行请求的锁。无论成功还是失败，都必须最终把它恢复为 false。
 */
function sendMessage() {
    if (state.isGenerating) return;
    var text = dom.messageInput.value.trim();
    if (!text) return;
    var conv = getActiveConv();
    if (!conv) return;

    appendUserMessageToConversation(conv, text);
    prepareGroupSpeakerForUserMessage(conv, text);
    resetMessageComposerInput();
    persistState();
    requestFullRender();

    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                if (getActiveConv() === conv && isLiveConversation(conv)) updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            function(fullContent, fullCot, usage, completion) { handlePrimaryAssistantComplete(fullContent, fullCot, usage, conv, completion); },
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('Error: ' + (err.message || err));
            },
            conv
        );
        updateInputState();
    };

    start();
}
